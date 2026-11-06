// メモをメインのチャットの入力欄に添付する（右の欄・別ウィンドウのメモ・入力欄の上のメモの一覧から）。
// 別ウィンドウの中からは、メインのウィンドウのそのチャットに知らせる
import { parsePopout } from "@/app/popout";
import { postToMainWindow } from "@/app/windowBus";
import { alertDialog } from "@/ui/dialogs";
import { chatPaneOf } from "@/features/chat/pane/windowMessages";
import { memoAttachment, memoQuote } from "./memoAttachment";

/** メモ全体（selection がなければ）か、選んだ部分の引用を、チャットの入力欄の後ろに足す（送るのは自分で） */
export function attachMemoToChat(chatId: number, path: string, selection?: string) {
  const quote = selection?.trim() ? memoQuote(path, selection) : null;
  const text = quote ?? "";
  const attachments = quote ? undefined : [memoAttachment(path)];
  if (parsePopout(location.hash)) return postToMainWindow({ type: "fillComposer", chatId, text, attachments });
  const pane = chatPaneOf(chatId);
  if (!pane) return void alertDialog("チャットが開いていません", "添付するチャットの画面を開いてから、もう一度試してください。");
  pane.fillComposer(text, { append: true, attachments });
}
