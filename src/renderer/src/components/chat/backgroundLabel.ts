import type { BackgroundState, BackgroundTask } from "../../../../core/types";

/** 種類ごとの呼び名 */
const KIND_LABELS: Record<BackgroundTask["kind"], string> = { agent: "サブエージェント", command: "コマンド", other: "作業" };

/** 名前は 2 件まで並べ、残りは数で添える（作業中の行を長くしすぎない） */
function namesOf(tasks: BackgroundTask[]): string {
  const names = tasks.slice(0, 2).map((t) => t.description || KIND_LABELS[t.kind]);
  return tasks.length > 2 ? `${names.join("・")} ほか ${tasks.length - 2} 件` : names.join("・");
}

/**
 * 返答を書き終えて、裏の作業の終わりを待っているときの作業中の行の文
 * （「返答は終わりました。裏で動いているサブエージェント 1 件（調査）とコマンド 1 件（npm run dev）の終わりを待っています」）。
 * 待っていなければ undefined
 */
export function backgroundWaitLabel(state: BackgroundState | null): string | undefined {
  if (!state?.replied || state.tasks.length === 0) return undefined;
  const parts = (["agent", "command", "other"] as const)
    .map((kind) => state.tasks.filter((t) => t.kind === kind))
    .filter((tasks) => tasks.length > 0)
    .map((tasks) => `${KIND_LABELS[tasks[0].kind]} ${tasks.length} 件（${namesOf(tasks)}）`);
  return `返答は終わりました。裏で動いている${parts.join("と")}の終わりを待っています`;
}

/** 裏で動いている作業の数を、種類ごとに数える（止める前の確かめに使う） */
export function countBackground(state: BackgroundState | null): { agents: number; commands: number } {
  const tasks = state?.tasks ?? [];
  return { agents: tasks.filter((t) => t.kind === "agent").length, commands: tasks.filter((t) => t.kind !== "agent").length };
}
