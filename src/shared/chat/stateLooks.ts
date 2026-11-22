// チャットの状態の文と色の名前の表（画面とスマホが読む。純粋に保つ）
import { STATE_STRENGTH } from "@shared/chat/state";
import type { AgentState, BoardColumn } from "@shared/chat/types";

/**
 * 色の名前。画面の CSS は [data-state="<tone>"] が変数 --state-color を決める（styles/ui/status-slot.css）。
 * スマホは同じ名前から色の値を引く
 */
export type StateTone = "needs-input" | "running" | "failed" | "unread" | "read" | "draft";

interface StateLook {
  label: string;
  tone: StateTone;
}

/** エージェントの状態の文と色 */
export const STATE_LOOKS = {
  needs_input: { label: "回答待ち", tone: "needs-input" },
  failed: { label: "失敗", tone: "failed" },
  unread: { label: "未読", tone: "unread" },
  running: { label: "作業中", tone: "running" },
  read: { label: "既読", tone: "read" },
} as const satisfies Record<AgentState, StateLook>;

/** カンバンの列の文と色（列は 4 つ。失敗の列はなく、失敗は見るまで未読の列） */
export const COLUMN_LOOKS = {
  running: { label: "作業中", tone: "running" },
  needs_input: { label: "回答待ち", tone: "needs-input" },
  unread: { label: "未読", tone: "unread" },
  read: { label: "既読", tone: "read" },
} as const satisfies Record<BoardColumn, StateLook>;

/** 「下書き」（まだ送っていない。AI は何もしていない） */
export const DRAFT_LOOK = { label: "下書き", tone: "draft" } as const satisfies StateLook;

/**
 * いくつかの状態をまとめる: STATE_STRENGTH の順でいちばん強い状態を印に（空なら null）、状態ごとの数を添える
 */
export function summarizeStates(states: readonly AgentState[]): { mark: AgentState | null; counts: Record<AgentState, number> } {
  const counts: Record<AgentState, number> = { needs_input: 0, failed: 0, unread: 0, running: 0, read: 0 };
  for (const s of states) counts[s]++;
  return { mark: STATE_STRENGTH.find((s) => counts[s] > 0) ?? null, counts };
}
