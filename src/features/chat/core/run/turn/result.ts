// 1 回の実行の結果をチャットに反映し、作業の終わりの記録（止まったサブエージェントのお知らせと result）を残す。起動のとき抜けた終わりの記録を足すのも同じ関数
import { unfinishedSubagents } from "@shared/chat/subagents";
import type { ChatEventData, ChatEventDataOf } from "@shared/chat/chatEvent";
import type { Store } from "@/features/chat/core/stores";
import type { ProviderTurnResult } from "@/features/ai/core/index";
import { recordEvent } from "@/features/chat/core/run/record";
import type { ChatRun } from "@/features/chat/core/run/chatRun";

/** 結果をチャットに反映する（状態・費用・回数・コンテキスト・未読） */
export function applyResult(store: Store, runtime: ChatRun, result: ProviderTurnResult, compact: boolean, since: number, network: boolean) {
  const { chatId } = runtime;
  const current = store.chats.get(chatId)!;
  // 状態（result.status）は、作業の終わりにすることが済んで作業していないに戻ったときに殻が書く（chats.status は段階の写し）
  store.chats.update(chatId, {
    session_id: result.sessionId ?? current.session_id,
    cost_usd: current.cost_usd + (result.costUsd ?? 0),
    // 要約は会話の回数・最後の回答に数えない
    num_turns: current.num_turns + (compact ? 0 : (result.turns ?? 0)),
    error: result.error ?? null,
    ...(result.context
      ? { context_tokens: result.context.tokens, context_window: result.context.window ?? current.context_window }
      : compact && result.status === "completed"
        ? // 要約したあとの大きさが分からないときは、次の応答まで空にしておく
          { context_tokens: null }
        : {}),
    // 終わったら「未読」にする（中断・要約のときは除く）。最後の結果を一番下まで見ると消える
    unread: compact || result.status === "cancelled" ? current.unread : true,
  });
  // 止まったサブエージェントのお知らせは、通信の切断のときは出さない（つながってから再開する段取りが知らせる）。要約は compact イベントだけを残す（失敗したときは理由を残す）
  const end: ChatEventDataOf<"result"> = {
    status: result.status,
    text: result.status === "completed" ? result.result : result.error,
    ...(network ? { network: true } : {}),
    ...(result.usageLimit ? { usage_limit: { resets_at: result.usageLimit.resetsAt ?? null } } : {}),
    // 分岐・巻き戻しの起点（最後まで終わったときだけ。止めた作業の最後のメッセージはセッションに残らないことがある）
    ...(result.status === "completed" && result.lastMessageId && result.sessionId ? { session_id: result.sessionId, message_id: result.lastMessageId } : {}),
  };
  recordTurnEnd(store, chatId, { since: compact || network ? null : since, result: compact && result.status === "completed" ? null : end }, (event) => void recordEvent(store, runtime, event));
}

/**
 * 作業の終わりの記録: その作業（since より後）で始めて終わっていないサブエージェントのお知らせ（since が null なら出さない。Claude Code のプロセスが終わるため、
 * 見た目は進んでいるようで実は止まっているのを防ぐ）と、終わりの記録 result（ターンの境目・サブエージェントの数え方の区切り。null なら残さない）
 */
export function recordTurnEnd(store: Pick<Store, "events">, chatId: number, end: { since: number | null; result: ChatEventDataOf<"result"> | null }, add: (event: ChatEventData) => void = (event) => void store.events.add(chatId, event)) {
  const notice = end.since === null ? null : stoppedSubagentsNotice(unfinishedSubagents(store.events.forSubagents(chatId), end.since).map((s) => s.description));
  if (notice) add({ type: "notice", message: notice });
  if (end.result) add({ type: "result", ...end.result });
}

/** 作業の終わりとともに止まったサブエージェントのお知らせ（作業の終わりと、起動のときに終わりの記録を足すときで同じ文。なければ null） */
export function stoppedSubagentsNotice(descriptions: string[]): string | null {
  if (descriptions.length === 0) return null;
  return `サブエージェント ${descriptions.length} 件（${descriptions.join("、")}）は、作業の終わりとともに止まりました。続けるときは、サブエージェントの一覧の「再開」を押してください。`;
}

/**
 * 起動のときの復旧: 途中で止まった印のあるチャット（store.chats.recoverInterrupted の答え）のうち、最後の作業に終わりの記録（result）がないもの
 * （最後の自分の発言より後に result がない。アプリを終えたとき・落ちたときは applyResult が書く前に DB が閉じる）に、終わりの記録を足す（recordTurnEnd）。
 * status はチャットの状態に合わせる（失敗ならチャットの error を文に、中断なら中断）。足したチャットの ID を返す（もう終わりがあれば足さないので、起動し直しても 2 回は足さない）
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
    recordTurnEnd(store, chatId, { since: lastResult ?? 0, result: chat.status === "failed" ? { status: "failed", ...(chat.error ? { text: chat.error } : {}) } : { status: "cancelled" } });
    ended.push(chatId);
  }
  return ended;
}
