// 自分待ちがオンのときの表示を、2 つの軸（出し方 × 並べ方）に分けて扱う（保存は 1 つの値 SIDEBAR_WAITING_VIEW のまま）

/** 保存する表示: filter = 自分待ちだけ × プロジェクト別 / list = 自分待ちだけ × 状態順 / inbox = 上にまとめる × 状態順 / inbox-project = 上にまとめる × プロジェクト別 */
export type WaitingView = "filter" | "list" | "inbox" | "inbox-project";

/** 出し方: only = 自分待ちのチャットだけを出す / top = 一覧の上にまとめ、その下はすべて */
export const WAITING_SCOPES = ["only", "top"] as const;
export type WaitingScope = (typeof WAITING_SCOPES)[number];

/** 並べ方: project = プロジェクト別（プロジェクトの見出しに分ける）/ status = 状態順（プロジェクトをまたいで、状態の見出しに分けて急ぐものを先に） */
export const WAITING_ORDERS = ["project", "status"] as const;
export type WaitingOrder = (typeof WAITING_ORDERS)[number];

const AXES: Record<WaitingView, { scope: WaitingScope; order: WaitingOrder }> = {
  filter: { scope: "only", order: "project" },
  list: { scope: "only", order: "status" },
  inbox: { scope: "top", order: "status" },
  "inbox-project": { scope: "top", order: "project" },
};

/** 保存した表示の、出し方と並べ方 */
export const waitingAxes = (view: WaitingView) => AXES[view];

/** 出し方と並べ方から、保存する表示 */
export function waitingViewOf(scope: WaitingScope, order: WaitingOrder): WaitingView {
  return (Object.keys(AXES) as WaitingView[]).find((v) => AXES[v].scope === scope && AXES[v].order === order) ?? "filter";
}
