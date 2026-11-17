import { PROVIDER_LABELS, type ChatEventOf } from "@shared/types";
import { cx } from "@/lib/cx";
import { Markdown } from "@/ui/markdown/Markdown";
import { useMessageMenu } from "./useMessageMenu";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { ChildChatMarks } from "@/features/chat/children/ChildChatChips";
import { useProviderAtEvent } from "@/features/chat/store/useChatStore";

/** AI の返答 1 つ（右クリックで、この返答だけをコピーできる） */
export function AssistantMessage({ event }: { event: ChatEventOf<"text"> }) {
  const data = event.data;
  const text = data.text;
  const menu = useMessageMenu(text, undefined, { rich: true, eventId: event.id });
  const pane = useOptionalChatPane();
  const provider = useProviderAtEvent(event.chat_id, event.id);
  return (
    <>
      <div className={cx("assistant", Boolean(data.parent) && "sub")} id={`ev-${event.id}`} onContextMenu={menu.open}>
        {!data.parent && provider && <div className="assistant-provider muted small">{PROVIDER_LABELS[provider]}</div>}
        <Markdown>{text}</Markdown>
      </div>
      {/* この返答から聞いた子チャットの札 */}
      {pane && <ChildChatMarks chatId={pane.chatId} eventId={event.id} />}
      {menu.element}
    </>
  );
}
