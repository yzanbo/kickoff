// メモを開いたチャットの入力欄に追加する（押した時点の写しの札）（右の欄・別ウィンドウのメモ・入力欄の上のメモの一覧から）。
// 別ウィンドウの中からは、メインのウィンドウのそのチャットに知らせる（addToChat）
import { addToChat } from "@/features/chat/pane/addToChat";
import { reportFailure } from "@/ui/dialogs";
import { api } from "@/api";

/** メモ全体（text がなければ。付けたときの写し）か、文（選択部分の引用・パス）を、チャットの入力欄の後ろに足す（送るのは自分で） */
export function attachMemoToChat(chatId: number, projectId: number, path: string, text: string | null = null) {
  if (text) return addToChat(chatId, text);
  void api.memoSnapshot(projectId, path)
    .then((attachment) => addToChat(chatId, "", [attachment]))
    .catch(reportFailure("メモをチャットに追加できませんでした"));
}
