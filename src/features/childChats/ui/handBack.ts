// 子チャットから親チャットへの依頼文の受け渡し（画面の側）: 子チャットの AI に依頼文を書いてもらう・作業の最後の返答を親チャットに渡す
import type { HandoffVia } from "@shared/chat/chatEvent";
import { UNTITLED_CHAT_TITLE, type Chat } from "@shared/chat/types";
import type { HandoffResult } from "@shared/childChats/types";
import { handoffAfterFor, handoffRequestPrompt, type HandoffAfter } from "@shared/chat/handoff";
import { api } from "@/foundation/ui/api";
import { childChatsApi } from "./api";
import { alert, prompt, reportFailure } from "@/foundation/ui/kit/ask";
import { knownChat, confirmArchiveChats, confirmDeleteChats } from "@/features/chat/ui";
import { handBackToParent } from "./askChild";

/**
 * 子チャットに、親への依頼文を書いてもらう（頼み方の文 handoffRequestPrompt を送る。記録の発言には頼みの印 handoff_request を付け、
 * 流れでは 1 行にたたむ）。送る前に、書き方の追加の指示を聞く（空のままでも頼める。添えたら頼み方の文の終わりに足す。やめたら送らない）。
 * 作業していなければすぐ送り、作業中なら止めずにいまのやり取りに伝える（チャット欄の「いま」と同じ送る口の when: now）
 */
export async function requestHandoff(chat: Pick<Chat, "id" | "title">) {
  const extra = await prompt({
    title: "依頼文を作ってもらう",
    message: "この子チャットの AI に、親チャットの AI へ渡す依頼文を書いてもらいます。書き方の注文があれば添えてください（空のままでも頼めます）。",
    label: "追加の指示（任意）",
    placeholder: "例: 手順は 3 つまでにまとめて。テストの方針も入れて",
    confirmLabel: "頼む",
    optional: true,
    multiline: true,
  }).then((r) => r?.value ?? null);
  if (extra === null) return;
  await api.sendMessage(chat.id, { text: handoffRequestPrompt(chat.title ?? "", extra), options: {}, attachments: [], when: "now", handoff_request: true }).catch(reportFailure("依頼文を頼めませんでした"));
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
    result = await childChatsApi("POST /api/chats/:chatId/handoff", { params: { chatId: child.id }, body: { via, turn_event_id: turnEventId } });
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
 * どちらもチャットのアーカイブ・削除と同じく確かめてから（削除は子孫も一緒と添える。confirmArchiveChats / confirmDeleteChats）。子が作業中なら、しないで知らせる
 */
async function afterHandoff(child: Chat, after: HandoffAfter) {
  if (after === "keep" || (after === "archive" && child.archived_at)) return;
  if (child.status === "running") {
    await alert(`子チャットが作業中なので、${after === "archive" ? "アーカイブ" : "削除"}しませんでした`, "作業が終わってから、子チャットの一覧・右クリックのメニューで片付けられます。");
    return;
  }
  if (after === "archive") await confirmArchiveChats(child);
  else await confirmDeleteChats(child);
}
