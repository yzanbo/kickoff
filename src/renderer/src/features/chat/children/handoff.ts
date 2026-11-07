// 子チャットから親チャットへの依頼文の受け渡し（画面の側）: 子チャットの AI に依頼文を書いてもらう・作業の最後の返答を親チャットに渡す
import type { Chat, HandoffResult, HandoffVia } from "@shared/types";
import { handoffRequestPrompt } from "@shared/chat/handoff";
import { api } from "@/api";
import { reportFailure } from "@/ui/dialogs";
import { handBackToParent } from "./openChild";

/**
 * 子チャットに、親への依頼文を書いてもらう（頼み方の文 handoffRequestPrompt を送る。記録の発言には頼みの印 handoff_request を付け、
 * 流れでは 1 行にたたむ）。作業していなければすぐ送り、作業中なら止めずにいまのやり取りに伝える（チャット欄の「いま」と同じ api.tellChat）
 */
export function requestHandoff(chat: Pick<Chat, "id" | "title">) {
  void api.tellChat(chat.id, handoffRequestPrompt(chat.title ?? ""), {}, [], false, { handoff_request: true }).catch(reportFailure("依頼文を頼めませんでした"));
}

/**
 * 子チャットの作業（作業の終わりの記録 turnEventId）の最後の返答を、そのまま（引用・見出しなし）直接の親チャットに渡す。
 * 入力欄: 親の入力欄の後ろに足して親を見せる（親の画面がなければ書きかけの文に足す。別ウィンドウからはメインに頼む。handBackToParent）/
 * 今すぐ送る: 親が作業していなければ送り、作業中なら伝える / 送信待ち: 親の送信待ちの最後に足す（どれもコアが送り、子に渡したことを記録する）。
 * 渡せたら結果、渡せなければ失敗を知らせて null
 */
export async function handOffTurn(child: Pick<Chat, "id" | "parent_chat_id">, turnEventId: number, via: HandoffVia): Promise<HandoffResult | null> {
  try {
    const result = await api.handOff(child.id, via, turnEventId);
    if (via === "composer") handBackToParent(child, result.text);
    return result;
  } catch (e) {
    reportFailure("親チャットに渡せませんでした")(e);
    return null;
  }
}
