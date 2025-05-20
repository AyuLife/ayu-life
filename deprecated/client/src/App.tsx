import  {
  createContext,
  useContext,
  useReducer,
  useRef,
  useEffect,
} from "react";
import ChatCloud from "./components/ChatCloud";
import ChatInput from "./components/ChatInput";
import BottomBar from "./components/BottomBar";
import { Hints, Role } from "./utils";
import HintChip from "./components/HintChip";
import useInfer from "./hooks/useInfer";

interface Message {
  id: string;
  content: string;
  role: Role;
}

export interface AppState {
  messages: Message[];
}

export enum AppActionType {
  ADD_MESSAGE = "ADD_MESSAGE",
  UPDATE_MESSAGE = "UPDATE_MESSAGE",
  APPEND_MESSAGE = "APPEND_MESSAGE"
}

export interface AppAction {
  type: AppActionType;
  payload?: any;
}

export type AppDispatch = (action: AppAction) => void;

interface AppContextProps {
  state: AppState;
  dispatch: AppDispatch;
  runInference: (args: { text: string; assistantId: string }) => void;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppContext.Provider");
  }
  return context;
}

const AppReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case AppActionType.ADD_MESSAGE:
      return { ...state, messages: [...state.messages, action.payload] };
    case AppActionType.UPDATE_MESSAGE:
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.payload.id
            ? { ...msg, content: action.payload.content }
            : msg
        ),
      };
      case AppActionType.APPEND_MESSAGE:
        return {
          ...state,
          messages: state.messages.map((msg) =>
            msg.id === action.payload.id
              ? { ...msg, content: msg.content ? msg.content + action.payload.content : action.payload.content }
              : msg
          ),
        };
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
};

function App() {
  const [state, dispatch] = useReducer(AppReducer, { messages: [] });
  const scrollRef = useRef<HTMLDivElement>(null);

  const { runInference, isReady } = useInfer({ state, dispatch });

  // auto-scroll to bottom on new message
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [state.messages]);

  if (!isReady) return <div className="flex items-center justify-center h-[100dvh] w-full">
  <div
    className="rounded-full border-secondary border-4 border-t-transparent w-12 h-12 animate-spin"
    role="status"
    aria-label="Loading…"
  />
</div>

  return (
    <AppContext.Provider value={{ state, dispatch, runInference }}>
      <main
        className="
          flex flex-col h-[100dvh] w-full
          md:w-[40vw] md:mx-auto md:shadow-md
          bg-background
        "
      >
        {/* 1) Scrollable message list, anchored bottom & scrollable up */}
        <div
          ref={scrollRef}
          className={`
            flex flex-col flex-1 min-h-0 overflow-y-auto p-4 space-y-4
            before:content-[''] before:flex-1 before:block
          `}
        >
          {state.messages.map((msg) => (
            <ChatCloud.Root key={msg.id} role={msg.role}>
              <ChatCloud.Container>
                <ChatCloud.Message>{msg.content}</ChatCloud.Message>
              </ChatCloud.Container>
            </ChatCloud.Root>
          ))}
        </div>

        <div className="px-4 pt-4 overflow-x-auto flex flex-nowrap whitespace-nowrap hide-scrollbar">
          <div className="flex space-x-2">
            {Hints.map((hint, index) => <HintChip key={index} text={hint}/>)}
          </div>
        </div>  
        {/* 2) Input area, pinned above bottom bar */}
        <div className="p-4 bg-background-light">
          <ChatInput placeholder="Type your message here..." />
        </div>

        {/* 3) Bottom bar */}
        <section className="flex-none">
          <BottomBar />
        </section>
      </main>
    </AppContext.Provider>
  );
}

export default App;
