// 未読・既読の切り替えの決まり（コア・画面・スマホで同じ。Node・DOM を読まない）。
// 未読・既読は作業が終わってからだけの状態なので、作業中・回答待ちの間は切り替えない
import type { AgentState } from "./types";

/**
 * 既読にするタイミング（全体で 1 つ。設定のチャットの欄）:
 * at_bottom = 一番下まで見たら既読（一番下が見えていて、自分で操作したとき）/ button = 一番下まで見て、ボタンで既読（自動では既読にしない）
 */
export const READ_TIMINGS = ["at_bottom", "button"] as const;
export type ReadTiming = (typeof READ_TIMINGS)[number];

export const READ_TIMING_LABELS: Record<ReadTiming, string> = {
  at_bottom: "一番下まで見たら既読",
  button: "一番下まで見て、ボタンで既読",
};

/** 既読⇔未読の切り替えの向き（seen = 既読にする・unseen = 未読にする） */
export type ReadToggle = "seen" | "unseen";

export const READ_TOGGLE_LABELS: Record<ReadToggle, string> = {
  seen: "既読にする",
  unseen: "未読にする",
};

/** 作業中・回答待ちで切り替えられないときの説明（パソコンの画面・スマホで同じ） */
export const READ_TOGGLE_BUSY_NOTE = "作業中・回答待ちの間は、未読・既読を変えられません";

/**
 * いまの状態から切り替える向き（作業中・回答待ちは null = 切り替えない）。
 * 失敗したものは見るまで未読と同じ扱い（agentStateOf が未読の印のある失敗だけを failed にする）なので、既読にする
 */
export function readToggleOf(state: AgentState): ReadToggle | null {
  if (state === "unread" || state === "failed") return "seen";
  if (state === "read") return "unseen";
  return null;
}
