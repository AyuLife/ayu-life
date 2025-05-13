import logging
import os
import time
from typing import List, Dict
from uuid import uuid4
from langfuse import Langfuse
from langfuse.decorators import observe
import anyio

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langfuse.openai import OpenAI
from openai import OpenAIError, AssistantEventHandler, AsyncAssistantEventHandler

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

# --- Langfuse Init --------------------------------

langfuse = Langfuse(
  secret_key="sk-lf-48b35763-9341-4fa6-9ca1-6f9b63be95fb",
  public_key="pk-lf-4a9d6470-f2ef-421e-8111-22f82b5bd1ae",
  host="https://us.cloud.langfuse.com",
    debug=True,     
threads=1,      
timeout=20,     
sample_rate=1.0 
)
assert langfuse.auth_check(), "Langfuse authentication failed"

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


class StreamHandler(AssistantEventHandler):
    """Accumulate and forward text deltas over the WebSocket."""
    def __init__(self, ws: WebSocket):
        super().__init__()
        self.ws = ws
        self._full = ""

    def on_text_delta(self, delta, snapshot):
        # Bridge sync callback → async send_json
        anyio.from_thread.run(self.ws.send_json, {"token": delta.value})               
        self._full += delta.value                                                      

    @property
    def full_text(self):
        return self._full
    

@app.websocket("/ws/chat")
async def chat_ws(ws: WebSocket):
    await ws.accept()
    conv_id = str(uuid4())
    logger.info("WS connected, conv=%s", conv_id)

    # Create a persistent thread for this session
    thread = client.beta.threads.create()
    thread_id = thread.id
    logger.info("Using thread %s for conv %s", thread_id, conv_id)

    try:
        while True:
            data      = await ws.receive_json()
            user_msg  = data["message"]
            history   = data.get("history", [])

            # 1️⃣ Start trace manually
            trace = langfuse.trace(
                name="chat.exchange",
                input={"user.message": user_msg},
                metadata={"conversation.id": conv_id, "thread.id": thread_id},
            )

            # 2️⃣ Replay history + post user turn
            for m in history:
                client.beta.threads.messages.create(
                    thread_id=thread_id, role=m["role"], content=m["content"]
                )
            client.beta.threads.messages.create(
                thread_id=thread_id, role="user", content=user_msg
            )

            # 3️⃣ Stream assistant response
            handler = StreamHandler(ws)
            with client.beta.threads.runs.stream(
                thread_id=thread_id,
                assistant_id=assistant_id,
                event_handler=handler,
            ):  # ← synchronous context, not async :contentReference[oaicite:3]{index=3}
                pass  # callbacks fire as events arrive

            client.beta.threads.messages.create(
                thread_id=thread_id,
                role="assistant",
                content=handler.full_text,
            )

            # 5️⃣ End trace with output
            trace.update(output={"assistant.reply": handler.full_text})
            # (no `trace.end()`, spans flush on shutdown)
            
            # 6️⃣ Let client know you’re done
            await ws.send_json({"done": True})

            # 7️⃣ Prepare next exchange
            # (you can start a fresh trace here or let decorator handle it)
            # trace = langfuse.trace(...)

    except WebSocketDisconnect:
        logger.info("WS disconnected, conversation=%s", conv_id)
    except OpenAIError as e:
        logger.error("OpenAIError: %s", e)
        await ws.send_json({"error": str(e)})
        await ws.close()

@app.on_event("shutdown")
def on_shutdown():
    langfuse.shutdown()