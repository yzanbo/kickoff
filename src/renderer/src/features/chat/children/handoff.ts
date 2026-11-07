// 子チャットから親チャットへの依頼文の受け渡し（画面の側）: 子チャットの AI に依頼文を書いてもらう・作業の最後の返答を親チャットに渡す
import { UNTITLED_CHAT_TITLE, type Chat, type HandoffResult, type HandoffVia } from "@shared/types";
import { handoffAfterFor, handoffRequestPrompt, type HandoffAfter } from "@shared/chat/handoff";
import { api } from "@/api";
import { alertDialog, reportFailure } from "@/ui/dialogs";
import { knownChat } from "@/stores/chats";
import { confirmDeleteChat, toggleArchiveChat } from "@/features/chat/chatActions";
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
 * 渡せたら、渡したあと（after）に子チャットをアーカイブ・削除する（afterHandoff）。渡せたら結果、渡せなければ失敗を知らせて null
 */
export async function handOffTurn(child: Chat, turnEventId: number, via: HandoffVia, after: HandoffAfter = "keep"): Promise<HandoffResult | null> {
  let result: HandoffResult;
  try {
    result = await api.handOff(child.id, via, turnEventId);
  } catch (e) {
    reportFailure("親チャットに渡せませんでした")(e);
    return null;
  }
  if (via === "composer") handBackToParent(child, result.text, { chat_id: child.id, title: child.title || UNTITLED_CHAT_TITLE });
  await afterHandoff(knownChat(child.id) ?? child, handoffAfterFor(after, via)).catch(reportFailure("子チャットを片付けられませんでした"));
  return result;
}

/**
 * 渡したあとの子チャット: アーカイブ・削除（入力欄に入れたときの削除は、依頼文が入力欄にしか残らなくなるのでアーカイブ。handoffAfterFor）。
 * どちらもチャットのアーカイブ・削除と同じく確かめてから（削除は子孫も一緒と添える。toggleArchiveChat / confirmDeleteChat）。子が作業中なら、しないで知らせる
 */
async function afterHandoff(child: Chat, after: HandoffAfter) {
  if (after === "keep" || (after === "archive" && child.archived_at)) return;
  if (child.status === "running") {
    await alertDialog(`子チャットが作業中なので、${after === "archive" ? "アーカイブ" : "削除"}しませんでした`, "作業が終わってから、子チャットの一覧・右クリックのメニューで片付けられます。");
    return;
  }
  if (after === "archive") await toggleArchiveChat(child);
  else await confirmDeleteChat(child);
}
