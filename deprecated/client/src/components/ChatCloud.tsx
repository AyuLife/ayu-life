import { cva } from "class-variance-authority";
import { createContext, HTMLAttributes, ReactNode, useContext } from "react";
import ReactMarkdown from "react-markdown";
import { Role } from "../utils";
import Logo from "../assets/Logo.svg";

const ROLES: Role[] = [Role.ASSISTANT, Role.USER];

interface ChatCloudContextProps {
  role: Role;
}

interface ChatCloudRootProps extends ChatCloudContextProps {
  children?: ReactNode;
}

const ChatCloudContext = createContext<ChatCloudContextProps | undefined>(
  undefined,
);

const useChatCloud = () => {
  const context = useContext(ChatCloudContext);
  if (!context) {
    throw new Error("Use useChatCloud inside the Chat Cloud component");
  }

  return context;
};

const Root = ({ role, children }: ChatCloudRootProps) => {
  return <ChatCloudContext value={{ role }}>{children}</ChatCloudContext>;
};

const Container = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => {
  const { role } = useChatCloud();

  if (!ROLES.includes(role)) {
    throw Error(
      "Role not set correctly. Please fix it. It should either be `assistant` | `user`",
    );
  }

  const container = cva("flex items-start space-x-3 mt-8", {
    variants: {
      intent: {
        assistant: ["ml-6"],
        user: ["justify-end mr-6"],
      },
    },
  });

  const classes = container({ intent: role, class: className });

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};

const Message = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) => {
  const { role } = useChatCloud();

  const message = cva(
    "z-10 relative p-2 rounded-lg max-w-[80%] shadow-md [&_.markdown-content]:prose [&_.markdown-content]:prose-sm [&_.markdown-content]:max-w-none [&_.markdown-content>p]:my-0 [&_.markdown-content>p:not(:last-child)]:mb-2",
    {
      variants: {
        intent: {
          assistant: ["bg-primary rounded-bl-none text-assistant-message"],
          user: ["bg-accent rounded-br-none text-user-message"],
        },
      },
    },
  );

  const classes = message({ intent: role, class: className });

  const isTyping = children === null || children === undefined;

  const tailPosition =
    role === "assistant"
      ? "absolute left-4 -bottom-4 rotate-90 -translate-x-full"
      : "absolute right-4 -bottom-4 rotate-180  translate-x-full";

  // match the tail color to the bubble
  const tailColor = role === "assistant" ? "text-primary" : "text-accent";

  const roleDivClasses =
    role === "assistant"
      ? "-left-4 border-bot-icon-border border-3 bg-user-message"
      : "-right-4";

  return (
    <div className={classes} {...props}>
      {isTyping ? (
        <div className="flex space-x-1 items-end h-4">
          {[0, 200, 400].map((delay) => (
            <span
              key={delay}
              className="w-2 h-2 bg-accent rounded-full animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      ) : typeof children === "string" ? (
        <div className="markdown-content">
          <ReactMarkdown>{children}</ReactMarkdown>
        </div>
      ) : (
        children
      )}
      <div className={`${tailPosition}`}>
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className={`w-4 h-4  ${tailColor}`}
        >
          <polygon points="0,24 0,0 24,24" />
        </svg>
      </div>
      <div
        className={`w-10 h-10 absolute rounded-full -bottom-11 flex items-center justify-center ${roleDivClasses}`}
      >
        {role === "assistant" ? (
          <img src={Logo} alt="Logo" />
        ) : (
          <img src={"https://avatar.iran.liara.run/public"} alt="Logo" />
        )}
      </div>
    </div>
  );
};

const ChatCloud = { Root, Container, Message };

export default ChatCloud;
