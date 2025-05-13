import logging
import os
import time
from typing import List, Dict
from uuid import uuid4
from langfuse import Langfuse

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langfuse.openai import OpenAI
from openai import OpenAIError, AssistantEventHandler

# —————————————— Logging Setup ——————————————
# Set the root logger to DEBUG so you see everything
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)-8s %(name)-15s %(message)s",
)

# Reduce verbosity from uvicorn internals if you like:
logging.getLogger("uvicorn.access").setLevel(logging.INFO)
logging.getLogger("uvicorn.error").setLevel(logging.INFO)

# Turn on OpenAI SDK debug logging (this also flips on HTTPX debug)
os.environ["OPENAI_LOG"] = "debug"
logging.getLogger("openai").setLevel(logging.DEBUG)
logging.getLogger("httpx").setLevel(logging.DEBUG)

logger = logging.getLogger(__name__)

# ─── Init ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="OpenAI API Backend with WebSockets")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],            # lock this down to your UI in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load creds
api_key = os.getenv("OPENAI_API_KEY")
assistant_id = os.getenv("ASSISTANT_ID")

if not api_key or not assistant_id:
    raise RuntimeError("Set OPENAI_API_KEY and ASSISTANT_ID env vars")

client = OpenAI(api_key=api_key)
# langfuse = Langfuse(
#   secret_key="sk-lf-48b35763-9341-4fa6-9ca1-6f9b63be95fb",
#   public_key="pk-lf-4a9d6470-f2ef-421e-8111-22f82b5bd1ae",
#   host="https://us.cloud.langfuse.com",
# )
langfuse = Langfuse()
assert langfuse.auth_check(), "Langfuse authentication failed"

# ─── In-memory session store ─────────────────────────────────────────────────────
# Map each WebSocket connection to its thread ID
active_sessions: Dict[WebSocket, str] = {}

# ─── Request / Response Models ───────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    # optionally support passing past messages:
    history: List[dict] = []  # e.g. [{"role":"user","content":"..."}]


class ChatResponse(BaseModel):
    reply: str


# ─── HTTP endpoints ───────────────────────────────────────────────────────────────
@app.get("/")
async def health_check():
    return {"status": "ok", "assistant_id": assistant_id}


@app.post("/chat", response_model=ChatResponse)
async def chat_http(req: ChatRequest):
    """
    Stateless HTTP fallback: creates a new thread for every call,
    replays req.history + req.message, waits for completion, returns reply.
    """
    try:
        # 1️⃣ start thread
        thread = client.beta.threads.create()

        # 2️⃣ replay history + user message
        for msg in req.history:
            client.beta.threads.messages.create(
                thread_id=thread.id, role=msg["role"], content=msg["content"]
            )
        client.beta.threads.messages.create(
            thread_id=thread.id, role="user", content=req.message
        )

        # 3️⃣ run assistant (non-streaming)
        run = client.beta.threads.runs.create(
            thread_id=thread.id, assistant_id=assistant_id
        )

        # 4️⃣ poll until done
        while run.status in ("queued", "in_progress"):
            time.sleep(0.5)
            run = client.beta.threads.runs.retrieve(
                thread_id=thread.id, run_id=run.id
            )

        # 5️⃣ return the last assistant message
        msgs = client.beta.threads.messages.list(thread_id=thread.id).data
        for m in reversed(msgs):
            if m.role == "assistant":
                return ChatResponse(reply=m.content[0].text.value)

        raise HTTPException(500, "No assistant reply found")

    except OpenAIError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── WebSocket chat endpoint ─────────────────────────────────────────────────────
class StreamHandler(AssistantEventHandler):
    """Collects just the text deltas from each 'thread.message.delta' event."""
    pass  # You can override on_text_created/on_text_delta if you need custom hooks

@app.websocket("/ws/chat")
async def chat_ws(ws: WebSocket):
    await ws.accept()
    conv_id = str(uuid4())
    logger.info("WS connected, conv=%s", conv_id)

    # 1️⃣ Create a new thread and stash its ID
    thread = client.beta.threads.create()
    thread_id = thread.id
    logger.debug("Thread created: %s (request_id=%s) for conv %s",
                 thread_id, getattr(thread, "_request_id", None), conv_id)
    active_sessions[ws] = thread_id

    session_trace = langfuse.trace(
        name="chat.session",
        metadata={"conversation.id": conv_id, "thread.id": thread_id},
    )

    try:
        while True:
            data     = await ws.receive_json()
            user_msg = data["message"]
            history  = data.get("history", [])
            logger.info("Thread %s — user says: %s", thread_id, user_msg)

            # 2️⃣ Replay history + new user message onto the thread
            for msg in history:
                client.beta.threads.messages.create(
                    thread_id=thread_id,
                    role=msg["role"],
                    content=msg["content"],
                )
            client.beta.threads.messages.create(
                thread_id=thread_id,
                role="user",
                content=user_msg,
            )

            # 3️⃣ Prepare chat messages for logging (optional)
            chat_messages = [
                {"role": m["role"], "content": m["content"]}
                for m in history
            ] + [{"role": "user", "content": user_msg}]
            logger.debug("Streaming run on %s with %d history messages",
                         thread_id, len(chat_messages))

            gen = session_trace.generation(
                name="openai-chat",
                input={"messages": chat_messages},
                metadata={"model": "gpt-4o-mini"}
            )

            # 4️⃣ Stream via Assistants API end-to-end
            handler = StreamHandler()

            with client.beta.threads.runs.create_and_stream(
                thread_id=thread_id,
                assistant_id=assistant_id,
                event_handler=handler,
            ) as stream:
                full_reply = ""
                # handler.text_deltas yields each text token in order
                for token in handler.text_deltas:
                    full_reply += token
                    await ws.send_json({"token": token})

            # 5️⃣ Persist the complete assistant message
            logger.info("Thread %s — assistant full reply: %r",
                        thread_id, full_reply)
            client.beta.threads.messages.create(
                thread_id=thread_id,
                role="assistant",
                content=full_reply,
            )

            gen.end(output={"reply": full_reply})

            # 6️⃣ Signal end-of-stream
            await ws.send_json({"done": True})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: %s", ws.client)
        active_sessions.pop(ws, None)

    except OpenAIError as e:
        logger.error("OpenAIError on thread %s: %s", thread_id, e)
        await ws.send_json({"error": str(e)})
        await ws.close()

@app.on_event("shutdown")
def on_shutdown():
    langfuse.shutdown()
