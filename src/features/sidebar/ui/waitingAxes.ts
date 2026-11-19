// 要対応がオンのときの表示を、2 つの軸（出し方 × 並べ方）に分けて扱う（保存は 1 つの値 SIDEBAR_WAITING_VIEW のまま）

/**
 * 保存する表示: filter = 要対応だけ × プロジェクト別 / list = 要対応だけ × 状態順 / inbox = 一覧の上に × 状態順 / inbox-project = 一覧の上に × プロジェクト別 /
 * in-project = プロジェクト内の上に（プロジェクトの中に置くので、並べ方はプロジェクト別だけ）
 */
export type WaitingView = "filter" | "list" | "inbox" | "inbox-project" | "in-project";

/** 出し方: only = 要対応のチャットだけを出す / top = 一覧全体の上にまとめ、その下はすべて / project = 各プロジェクトの中のいちばん上にまとめ、その下はすべて */
export const WAITING_SCOPES = ["only", "top", "project"] as const;
export type WaitingScope = (typeof WAITING_SCOPES)[number];

/** 並べ方: project = プロジェクト別（プロジェクトの見出しに分ける）/ status = 状態順（プロジェクトをまたいで、状態の見出しに分けて急ぐものを先に） */
export const WAITING_ORDERS = ["project", "status"] as const;
export type WaitingOrder = (typeof WAITING_ORDERS)[number];

const AXES: Record<WaitingView, { scope: WaitingScope; order: WaitingOrder }> = {
  filter: { scope: "only", order: "project" },
  list: { scope: "only", order: "status" },
  inbox: { scope: "top", order: "status" },
  "inbox-project": { scope: "top", order: "project" },
  "in-project": { scope: "project", order: "project" },
};

/** その出し方で並べ方を選べるか（プロジェクト内の上には、プロジェクトの中に置くのでプロジェクト別だけ） */
export const canChooseOrder = (scope: WaitingScope) => scope !== "project";

/** 保存した表示の、出し方と並べ方 */
export const waitingAxes = (view: WaitingView) => AXES[view];

/** 出し方と並べ方から、保存する表示（プロジェクト内の上には、並べ方によらず 1 つ） */
export function waitingViewOf(scope: WaitingScope, order: WaitingOrder): WaitingView {
  if (!canChooseOrder(scope)) return "in-project";
  return (Object.keys(AXES) as WaitingView[]).find((v) => AXES[v].scope === scope && AXES[v].order === order) ?? "filter";
}
