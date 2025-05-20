import { AppActionType, AppDispatch, AppState } from "../App";
import { useRef, useEffect, useCallback, useState } from "react";

const WS_ENDPOINT =
  import.meta.env.VITE_WS_ENDPOINT ||
  "wss://ayulife-server-266345219353.us-east4.run.app/ws/chat";

// const WS_ENDPOINT = "ws://localhost:8080/ws/chat"

export const useInfer = ({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: AppDispatch;
}) => {
  const socketRef = useRef<WebSocket | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Create and setup WebSocket connection
  const setupSocket = useCallback(() => {
    const ws = new WebSocket(WS_ENDPOINT);

    ws.onopen = () => {
      setIsReady(true);
      console.log("WebSocket connected to", WS_ENDPOINT);
    };

    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);

      // Stream token into the right assistant message
      if (data.token && assistantIdRef.current) {
        dispatch({
          type: AppActionType.APPEND_MESSAGE,
          payload: {
            id: assistantIdRef.current,
            content: data.token,
            append: true,
          },
        });
      }
      // Handle errors
      else if (data.error && assistantIdRef.current) {
        dispatch({
          type: AppActionType.UPDATE_MESSAGE,
          payload: {
            id: assistantIdRef.current,
            content: `Error: ${data.error}`,
            append: false,
          },
        });
        assistantIdRef.current = null;
      }
      // End‐of‐stream: drop the ref
      else if (data.done) {
        assistantIdRef.current = null;
      }
    };

    ws.onerror = (err) =>
      console.error(`[${new Date().toISOString()}] WebSocket error:`, err);

    socketRef.current = ws;
    return ws;
  }, [dispatch]);

  // Handle tab visibility changes and socket connection
  useEffect(() => {
    const handleVisibilityChange = () => {
      console.log(
        `[${new Date().toISOString()}] Tab visibility changed to: ${document.visibilityState}`,
      );
      if (document.visibilityState === "visible") {
        const ws = socketRef.current;
        if (
          !ws ||
          ws.readyState === WebSocket.CLOSED ||
          ws.readyState === WebSocket.CLOSING
        ) {
          console.log(
            `[${new Date().toISOString()}] Socket needs reconnection. Current state: ${ws ? ws.readyState : "null"}`,
          );
          console.log(
            `[${new Date().toISOString()}] Attempting to reconnect to WebSocket...`,
          );
          const newWs = setupSocket();
          socketRef.current = newWs;
        }
      }
    };

    // Initial socket setup
    const ws = setupSocket();

    // Add visibility change listener
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Cleanup
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (socketRef.current) {
        setIsReady(false);
        socketRef.current.close();
      }
    };
  }, [dispatch, setupSocket]);

  // Kick off an inference request
  const runInference = useCallback(
    (opts: { text: string; assistantId: string }) => {
      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error("WebSocket is not open yet");
        return;
      }

      // Remember which assistant message to stream into
      assistantIdRef.current = opts.assistantId;

      // Build the same history payload you had before
      const history = state.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      ws.send(
        JSON.stringify({
          message: opts.text,
          history,
        }),
      );
    },
    [state.messages],
  );

  return { runInference, isReady };
};

export default useInfer;
