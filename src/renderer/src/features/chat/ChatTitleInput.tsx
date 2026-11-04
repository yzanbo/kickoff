import type { Run } from "@shared/types";
import { CHAT_TITLE_MAX } from "./chatTitle";
import type { RunTitleEditor } from "./useChatRename";
import { InlineName } from "@/ui/InlineName";

/** チャットの名前をその場で変える入力欄（カード・リストの行・サイドバーの行で共通） */
export function ChatTitleInput({ run, editor, className }: { run: Run; editor: RunTitleEditor; className?: string }) {
  return <InlineName initial={run.title} maxLength={CHAT_TITLE_MAX} className={className} onSubmit={editor.onSubmit} onCancel={editor.onCancel} />;
}
