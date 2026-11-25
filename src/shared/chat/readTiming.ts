// 未読・既読の切り替えの決まり（コア・画面・スマホで同じ。Node・DOM を読まない）。
// 未読・既読は作業が終わってからだけの状態なので、作業中・回答待ちの間は切り替えない

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
