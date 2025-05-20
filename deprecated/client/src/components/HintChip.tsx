import { v4 } from "uuid";
import { AppActionType, useAppContext } from "../App";
import { Role } from "../utils";

const HintChip = ({ text }: { text: string }) => {
    const { dispatch, runInference } = useAppContext();

  async function handleSend() {
    dispatch({
      type: AppActionType.ADD_MESSAGE,
      payload: { role: Role.USER, content: text, id: v4() },
    });
    const assistantMessageId = v4();
    dispatch({
      type: AppActionType.ADD_MESSAGE,
      payload: { role: Role.ASSISTANT, content: null, id: assistantMessageId },
    });
    try {
        runInference({ text, assistantId: assistantMessageId });
    } catch (error) {
        console.error(error)
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

  return <button className="rounded-lg bg-primary font-semibold text-white text-sm px-2.5 py-1 " onClick={handleSend}>{ text }</button>
}

export default HintChip;