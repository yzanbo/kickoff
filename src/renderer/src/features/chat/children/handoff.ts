// 子チャットから親チャットへの依頼文の受け渡し（画面の側）: 子チャットの AI に依頼文を書いてもらう
import type { Chat } from "@shared/types";
import { handoffRequestPrompt } from "@shared/chat/handoff";
import { api } from "@/api";
import { reportFailure } from "@/ui/dialogs";

/**
 * 子チャットに、親への依頼文を書いてもらう（頼み方の文 handoffRequestPrompt を送る。記録の発言には頼みの印 handoff_request を付け、
 * 流れでは 1 行にたたむ）。作業していなければすぐ送り、作業中なら止めずにいまのやり取りに伝える（チャット欄の「いま」と同じ api.tellChat）
 */
export function requestHandoff(chat: Pick<Chat, "id" | "title">) {
  void api.tellChat(chat.id, handoffRequestPrompt(chat.title ?? ""), {}, [], false, { handoff_request: true }).catch(reportFailure("依頼文を頼めませんでした"));
}
