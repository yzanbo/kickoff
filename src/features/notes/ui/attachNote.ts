// ノートを開いたチャットの入力欄に追加する（押した時点の写しの札）（右の欄・別ウィンドウのノート・入力欄の上のノートの一覧から）。
// 別ウィンドウの中からは、メインのウィンドウのそのチャットに知らせる（addToChat）
import { addToChat } from "@/features/composer/ui/addToChat";
import { reportFailure } from "@/foundation/ui/kit/dialogs";
import { api } from "@/foundation/ui/api";

/** ノート全体（text がなければ。付けたときの写し）か、文（選択部分の引用・パス）を、チャットの入力欄の後ろに足す（送るのは自分で） */
export function attachNoteToChat(chatId: number, projectId: number, path: string, text: string | null = null) {
  if (text) return addToChat(chatId, text);
  void api.noteSnapshot(projectId, path)
    .then((attachment) => addToChat(chatId, "", [attachment]))
    .catch(reportFailure("ノートをチャットに追加できませんでした"));
}
