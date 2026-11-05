import type { ChatEventOf } from "@shared/types";
import { cx } from "@/lib/cx";
import { Markdown } from "@/ui/markdown/Markdown";
import { useMessageMenu } from "./useMessageMenu";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { ChildChatMarks } from "@/features/chat/children/ChildChatChips";

/** AI の返答 1 つ（右クリックで、この返答だけをコピーできる） */
export function AssistantMessage({ event }: { event: ChatEventOf<"text"> }) {
  const data = event.data;
  const text = data.text;
  const menu = useMessageMenu(text, undefined, { rich: true, eventId: event.id });
  const pane = useOptionalChatPane();
  return (
    <>
      <div className={cx("assistant", Boolean(data.parent) && "sub")} id={`ev-${event.id}`} onContextMenu={menu.open}>
        <Markdown>{text}</Markdown>
      </div>
      {/* この返答から聞いた子チャットの札 */}
      {pane && <ChildChatMarks chatId={pane.chatId} eventId={event.id} />}
      {menu.element}
    </>
  );
}
