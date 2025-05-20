import React, { useState } from "react";
import { AppActionType, useAppContext } from "../App";
import { v4 } from "uuid";
import { Role } from "../utils";

interface ChatInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  children?: React.ReactNode;
}

const ChatInput: React.FC<ChatInputProps> = ({ className, ...props }) => {
  const { dispatch, runInference } = useAppContext();
  const [text, setText] = useState<string>("");

  async function handleSend() {
    // don't allow send when there is a reply still not received.
    if (!text.trim()) return;
    dispatch({
      type: AppActionType.ADD_MESSAGE,
      payload: { role: Role.USER, content: text, id: v4() },
    });
    const assistantMessageId = v4();
    setText("");
    dispatch({
      type: AppActionType.ADD_MESSAGE,
      payload: { role: Role.ASSISTANT, content: null, id: assistantMessageId },
    });
    try {
      runInference({ text, assistantId: assistantMessageId });
    } catch (error) {
      console.error(error);
      dispatch({
        type: AppActionType.UPDATE_MESSAGE,
        payload: {
          role: Role.ASSISTANT,
          content:
            "Failed to get a response from AyuBot. Please try again later.",
          id: assistantMessageId,
        },
      });
    }
  }

  return (
    <div className="relative w-full">
      <input
        {...props}
        className={`
        bg-accent
        px-4
        py-3
        pr-14      /* <-- extra right padding for your button */
        rounded-lg
        w-full
        ${className ?? ""}
      `}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSend();
          }
        }}
      />
      <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
        <button onClick={handleSend}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            className="w-6 h-6 stroke-secondary"
          >
            <path
              d="m9.51 4.23 8.56 4.28c3.84 1.92 3.84 5.06 0 6.98l-8.56 4.28c-5.76 2.88-8.11.52-5.23-5.23l.87-1.73c.22-.44.22-1.17 0-1.61l-.87-1.74C1.4 3.71 3.76 1.35 9.51 4.23ZM5.44 12h5.4"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ChatInput;
