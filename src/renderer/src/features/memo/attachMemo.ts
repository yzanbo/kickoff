// メモをメインのチャットの入力欄に添付する（右の欄・別ウィンドウのメモ・入力欄の上のメモの一覧から）。
// 別ウィンドウの中からは、メインのウィンドウのそのチャットに知らせる（addToChat）
import { addToChat } from "@/features/chat/pane/addToChat";
import { memoAttachment } from "./memoAttachment";

/** メモ全体（text がなければ）か、文（選んだ部分の引用・パス）を、チャットの入力欄の後ろに足す（送るのは自分で） */
export function attachMemoToChat(chatId: number, path: string, text: string | null = null) {
  addToChat(chatId, text ?? "", text ? undefined : [memoAttachment(path)]);
}
