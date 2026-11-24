// プロジェクトと作業場所の色相（色の並びと、作業場所の好みの色。プロジェクト・土台の作業場所・worktrees が同じ並びを使う）
/**
 * プロジェクトの色の一覧（色相）。暗い背景でも見分けやすいよう、10 色を離して選ぶ（黄緑と緑のような、近くて似て見える色は入れない）
 */
export const PROJECT_HUES = [0, 28, 48, 135, 172, 200, 222, 262, 292, 330] as const;

/**
 * 作業場所の好みの色（key は作業するフォルダ。本体は空）。本体の色はいつもこれで、ワークツリーは初めて見たときにこれを第一の候補にして決め、覚える
 * （worktrees の core/colors.ts）。画面は一覧を読む前・一覧にない作業場所の仮の色にも使う
 */
export function workplaceDefaultHue(projectId: number, key: string): number {
  let hash = 0;
  for (const ch of `p${projectId}/w:${key || "main"}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PROJECT_HUES[hash % PROJECT_HUES.length];
}
