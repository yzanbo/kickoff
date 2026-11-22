// カンバンとステータス表示の決め方（コア・画面の両方で使う。Node 依存を持ち込まないこと）
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { AgentState, BoardColumn, Chat } from "@shared/chat/types";

/**
 * チャットのエージェントの状態。優先順位:
 * 回答待ち → エラー → 作業中 → 未読 → 既読。
 * 失敗したものも、見るまで（unread がある間）はエラーとして目立たせ、見たら既読にする
 */
export function agentStateOf(chat: Chat, hasPendingApproval: boolean): AgentState {
  if (hasPendingApproval) return "needs_input";
  if (chat.status === "failed" && chat.unread) return "failed";
  if (chat.status === "running") return "running";
  if (chat.unread) return "unread";
  return "read";
}

/**
 * 未読にする「新しい結果」の記録か: AI の文章の返答（サブエージェントのものは除く）・作業の終わり・失敗。
 * ツールの実行・考え中などの途中経過では未読にしない（作業中のチャットがずっと未読になるのを防ぐ）。
 * コア（turn.ts が未読を付ける）と画面（useMarkSeen が既読にする）が同じこの関数を使う。既読にしてよいかを見る db/events.ts の
 * latestUnreadId は同じ条件を SQL で書いているので、変えたらそちらも直す
 */
export function isUnreadEvent(event: ChatEvent): boolean {
  if (event.type === "text") return !event.data.parent;
  return event.type === "result" || event.type === "error";
}

/** 作業中のまま、まだ見ていない返答がある（作業中の印に未読の点を重ねる。カンバンの列・未読の数は作業中のまま） */
export function busyWithUnread(chat: Chat, state: AgentState): boolean {
  return chat.unread && state === "running";
}

/** いくつかの状態をまとめるときの強い順（回答待ちは手を止めているので最優先、次に作業中のリング。ボードの列の並びとは別） */
export const STATE_STRENGTH = ["needs_input", "running", "failed", "unread", "read"] as const satisfies readonly AgentState[];

/** カンバンの列（AI の状態だけで決まる。失敗したものも、見るまでは未読） */
export function boardColumnOf(state: AgentState): BoardColumn {
  if (state === "running") return "running";
  if (state === "needs_input") return "needs_input";
  if (state === "unread" || state === "failed") return "unread";
  return "read";
}
