import type { Chat } from "@shared/types";
import { CHAT_TITLE_MAX } from "@shared/types";
import type { ChatTitleEditor } from "./useChatRename";
import { InlineName } from "@/ui/InlineName";

/** チャットの名前をその場で変える入力欄（カード・リストの行・サイドバーの行で共通） */
export function ChatTitleInput({ chat, editor, className }: { chat: Chat; editor: ChatTitleEditor; className?: string }) {
  return <InlineName initial={chat.title} maxLength={CHAT_TITLE_MAX} className={className} onSubmit={editor.onSubmit} onCancel={editor.onCancel} />;
}
