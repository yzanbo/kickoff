// ノートを開いたチャットの入力欄に追加する（押した時点の写しの札）（右の欄・別ウィンドウのノート・入力欄の上のノートの一覧から）。
// 別ウィンドウの中からは、メインのウィンドウのそのチャットに知らせる（appendToDraft）
import { appendToDraft } from "@/features/composer/ui";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { api } from "@/foundation/ui/api";

/** ノート全体（text がなければ。付けたときの写し）か、文（選択部分の引用・パス）を、チャットの入力欄の後ろに足す（送るのは自分で） */
export function attachNoteToChat(chatId: number, projectId: number, path: string, text: string | null = null) {
  if (text) return appendToDraft(chatId, text);
  void api.noteSnapshot(projectId, path)
    .then((attachment) => appendToDraft(chatId, "", [attachment]))
    .catch(reportFailure("ノートをチャットに追加できませんでした"));
}
