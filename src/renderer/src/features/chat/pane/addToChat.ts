// チャットの入力欄の後ろに文（と添付）を足す口（右の欄・別ウィンドウの「チャットに追加」・右クリックの「メインのチャット」・メモの添付で共通）
import type { Attachment } from "@shared/types";
import { parsePopout } from "@/app/popout";
import { postToMainWindow } from "@/app/windowBus";
import { alertDialog } from "@/ui/dialogs";
import { chatPaneOf } from "./windowMessages";

/**
 * そのチャットの入力欄の後ろに足す（送るのは自分で）。このウィンドウにそのチャットの画面があればそこへ（右の欄の子チャット・別ウィンドウの子チャットなど）、
 * なければ、別ウィンドウの中からはメインのウィンドウに頼む。メインのウィンドウで画面が開いていなければ知らせる
 */
export function addToChat(chatId: number, text: string, attachments?: Attachment[]) {
  const pane = chatPaneOf(chatId);
  if (pane) return pane.fillComposer(text, { append: true, attachments });
  if (parsePopout(location.hash)) return postToMainWindow({ type: "fillComposer", chatId, text, attachments });
  void alertDialog("チャットが開いていません", "足す先のチャットの画面を開いてから、もう一度試してください。");
}
