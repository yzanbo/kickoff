// 自分待ちのチャットを、プロジェクトをまたいで急ぐ順に並べる（自分待ちの表示の「上にまとめる」「1 列にまとめる」）
import type { AgentState, Approval, Chat } from "@shared/types";

/** 見出しの順（急ぐ順）: 回答待ち（承認・質問で AI が止まっている）→ エラー → 未読 */
export const INBOX_STATES = ["needs_input", "failed", "unread"] as const satisfies readonly AgentState[];
export type InboxState = (typeof INBOX_STATES)[number];

export interface InboxSection {
  state: InboxState;
  chats: Chat[];
}

const isInboxState = (state: AgentState): state is InboxState => (INBOX_STATES as readonly AgentState[]).includes(state);

/**
 * 待ち始めた時刻: 回答待ちは、いちばん古い依頼が届いた時刻（なければ最後に動いた時刻）、ほかは最後に動いた時刻（結果が届いた時刻）
 */
export function waitingSince(chat: Chat, state: AgentState, approvals: readonly Pick<Approval, "chat_id" | "created_at">[]): string {
  if (state !== "needs_input") return chat.active_at;
  const times = approvals.filter((a) => a.chat_id === chat.id).map((a) => a.created_at);
  return times.length ? times.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a)) : chat.active_at;
}

/**
 * 自分待ちのチャット（アーカイブしたものは除く）を急ぐ順の見出しに分け、見出しの中は待っている時間の長い順（待ち始めた時刻の古いものが上）に並べる。
 * 空の見出しは返さない
 */
export function inboxSections(
  chats: readonly Chat[],
  stateOf: (chat: Chat) => AgentState,
  since: (chat: Chat, state: AgentState) => string,
): InboxSection[] {
  const byState = new Map<InboxState, { chat: Chat; at: number }[]>();
  for (const chat of chats) {
    if (chat.archived_at) continue;
    const state = stateOf(chat);
    if (!isInboxState(state)) continue;
    const list = byState.get(state) ?? [];
    list.push({ chat, at: Date.parse(since(chat, state)) });
    byState.set(state, list);
  }
  return INBOX_STATES.flatMap((state) => {
    const list = byState.get(state);
    return list ? [{ state, chats: list.sort((a, b) => a.at - b.at || a.chat.id - b.chat.id).map((x) => x.chat) }] : [];
  });
}
