import { agentStateOf, boardColumnOf } from "@shared/chat/state";
import type { AgentState, Approval, Chat } from "@shared/types";

/** 回答待ちの依頼があるチャットの ID（approvals を 1 回なめて作り、チャットごとの判定に使う） */
export type ApprovalIndex = ReadonlySet<number>;

export const approvalIndex = (approvals: readonly Pick<Approval, "chat_id">[]): ApprovalIndex => new Set(approvals.map((a) => a.chat_id));

/** チャットの状態（回答待ちの依頼があれば回答待ち。コアの agentStateOf を、回答待ちの一覧で引く） */
export const chatStateOf = (chat: Chat, approvals: ApprovalIndex): AgentState => agentStateOf(chat, approvals.has(chat.id));

/** 数を出す状態（カンバンの列のうち既読を除いたもの。この順に並べる） */
export const COUNTED_COLUMNS = ["running", "needs_input", "unread"] as const;

/** 数を出す状態（作業中・回答待ち・未読。サイドバーの見出しの数で絞る状態・⌘⇧A のまとまりも同じ） */
export type CountedColumn = (typeof COUNTED_COLUMNS)[number];

/** 状態ごとのチャット数（作業中・回答待ち・未読） */
export type StateCounts = Record<CountedColumn, number>;

/**
 * 状態ごとのチャット数。カンバンの列と同じ決め方（boardColumnOf）で数え、既読とアーカイブ済みは数えない。
 * サイドバーのプロジェクト・プロジェクトの画面の見出し・全プロジェクトの画面の見出しで同じ数になるよう、数えるのはここだけ
 */
export function stateCounts(chats: readonly Chat[], pending: ApprovalIndex): StateCounts {
  const counts: StateCounts = { running: 0, needs_input: 0, unread: 0 };
  for (const r of chats) {
    if (r.archived_at) continue;
    const column = boardColumnOf(chatStateOf(r, pending));
    if (column !== "read") counts[column]++;
  }
  return counts;
}

/** いくつかの状態をまとめた 1 つの印（StatusSlot に渡す。unread は作業中のリングの右上の緑の点） */
export interface SummaryState {
  state: AgentState;
  unread: boolean;
}

/** まとめるときに強い順（回答待ちは手を止めているので最優先、次に作業中のリング） */
const SUMMARY_ORDER = ["needs_input", "running", "failed", "unread", "read"] as const satisfies readonly AgentState[];

/**
 * いくつかの状態を 1 つの印にまとめる（入力欄の上の子チャット・サブエージェントのピルの左。開かなくても様子が分かるように）。
 * 回答待ち > 作業中 > 失敗 > 未読 > 既読 の順で強いものを出し、作業中で、ほかに未読があれば unread（リングに緑の点を重ねる）。空なら既読
 */
export function summaryState(states: readonly AgentState[]): SummaryState {
  const has = new Set(states);
  const state = SUMMARY_ORDER.find((s) => has.has(s)) ?? "read";
  return { state, unread: state === "running" && has.has("unread") };
}
