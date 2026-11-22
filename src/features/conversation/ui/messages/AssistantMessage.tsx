import type { ChatEventOf } from "@shared/chat/chatEvent";
import { PROVIDER_LABELS } from "@shared/settings/types";
import { cx } from "@/foundation/ui/lib/cx";
import { Markdown } from "@/foundation/ui/markdown/Markdown";
import { useMessageMenu } from "./useMessageMenu";
import { useOptionalChatScreen, CreatedChatMarks } from "@/features/chat/ui";
import { useProviderAtEvent } from "@/features/providerSwitch/ui";

/** AI の返答 1 つ（右クリックで、この返答だけをコピーできる） */
export function AssistantMessage({ event }: { event: ChatEventOf<"text"> }) {
  const data = event.data;
  const text = data.text;
  const menu = useMessageMenu(text, undefined, { rich: true, eventId: event.id });
  const screen = useOptionalChatScreen();
  const provider = useProviderAtEvent(event.chat_id, event.id);
  return (
    <>
      <div className={cx("assistant", Boolean(data.parent) && "sub")} id={`ev-${event.id}`} onContextMenu={menu.open}>
        {!data.parent && provider && <div className="assistant-provider muted small">{PROVIDER_LABELS[provider]}</div>}
        <Markdown>{text}</Markdown>
      </div>
      {/* この返答から聞いた子チャットの札 */}
      {screen && <CreatedChatMarks chatId={screen.chatId} eventId={event.id} />}
      {menu.element}
    </>
  );
}
