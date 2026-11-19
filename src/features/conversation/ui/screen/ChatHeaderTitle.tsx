import type { Chat } from "@shared/types";
import { chatTitle } from "@/features/chat/ui/chatTitle";
import { ChatTitleInput } from "@/features/chat/ui/ChatTitleInput";
import { useChatRename } from "@/features/chat/ui/useChatRename";

/**
 * チャットの見出しの行の名前（子チャットの上の帯の名前と同じ見せ方。ダブルクリックでその場で名前を変える）。
 * 子チャットは上の帯（ChildChatBar）に名前があるので、親のないチャットだけに出す（呼ぶ側で決める）
 */
export function ChatHeaderTitle({ chat }: { chat: Chat }) {
  const rename = useChatRename();
  const editor = rename.editorFor(chat);
  const title = chatTitle(chat.title);
  if (editor) {
    return (
      <span className="chat-header-title editing">
        <ChatTitleInput chat={chat} editor={editor} className="chat-header-title-input" />
      </span>
    );
  }
  return (
    <span className="chat-header-title" data-tip={`${title}（ダブルクリックで名前を変更）`} onDoubleClick={() => rename.start(chat)}>
      {title}
    </span>
  );
}
