import { unfinishedSubagents } from "@shared/chat/subagents";
import type { ChatEventDataOf } from "@shared/chat/chatEvent";
import type { Store } from "@/features/chat/core/stores";

/**
 * 作業の終わりとともに止まったサブエージェントのお知らせ（Claude Code のプロセスが終わるため。見た目は進んでいるようで、実は止まっているのを防ぐ）。
 * 作業の終わり（turn.ts の applyResult）と、起動のときに終わりの記録を足すとき（endInterruptedTurns）で同じ文にする。なければ null
 */
export function stoppedSubagentsNotice(descriptions: string[]): string | null {
  if (descriptions.length === 0) return null;
  return `サブエージェント ${descriptions.length} 件（${descriptions.join("、")}）は、作業の終わりとともに止まりました。続けるときは、サブエージェントの一覧の「再開」を押してください。`;
}

/**
 * 起動のときの復旧: 途中で止まった印のあるチャット（store.chats.recoverInterrupted の答え）のうち、最後の作業に終わりの記録（result）がないもの
 * （最後の自分の発言より後に result がない。アプリを終えたとき・落ちたときは applyResult が書く前に DB が閉じる）に、終わりの記録を足す。
 * 終わりの記録はターンの境目（chatLogQuery.ts）とサブエージェントの数え方の区切りなので、抜けると次の作業とつながり、止まったサブエージェントが動いているように見える。
 * status はチャットの状態に合わせ（失敗ならチャットの error を文に、中断なら中断）、applyResult と同じく、その作業で始めて終わっていないサブエージェントのお知らせを先に残す。
 * 足したチャットの ID を返す（もう終わりがあれば足さないので、起動し直しても 2 回は足さない）
 */
export function endInterruptedTurns(store: Store, chatIds: readonly number[]): number[] {
  const ended: number[] = [];
  for (const chatId of chatIds) {
    const chat = store.chats.get(chatId);
    if (!chat || (chat.status !== "failed" && chat.status !== "cancelled")) continue;
    const lastUser = store.events.latestUserId(chatId);
    const lastResult = store.events.latestResultId(chatId);
    if (lastUser === null || (lastResult !== null && lastResult > lastUser)) continue;
    // その作業 = 前の作業の終わりより後（途中で伝えた発言のあとに始めたものも含める）
    const notice = stoppedSubagentsNotice(unfinishedSubagents(store.events.list(chatId), lastResult ?? 0).map((s) => s.description));
    if (notice) store.events.add(chatId, { type: "notice", message: notice });
    const end: ChatEventDataOf<"result"> = chat.status === "failed" ? { status: "failed", ...(chat.error ? { text: chat.error } : {}) } : { status: "cancelled" };
    store.events.add(chatId, { type: "result", ...end });
    ended.push(chatId);
  }
  return ended;
}
