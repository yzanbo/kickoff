import type { GitWorktree } from "@shared/foundation/workplace";
import { pickProjectHue } from "@shared/projects/colors";
import { workplaceDefaultHue } from "@shared/foundation/hues";
import type { WorktreeStores } from "@/features/worktrees/core/db/stores";

/**
 * ワークツリーの一覧に作業場所の色（hue）を付ける（一覧を返す API はすべてこれを通す）。本体はいつもプロジェクトから決まる色。
 * ワークツリーは覚えた色（worktrees の hue）を使い、まだなければ（Kickoff で作った直後・Kickoff の外で作ったものを初めて見たとき）ここで決めて覚える:
 * フォルダから決まる好みの色が、本体といまあるワークツリーの色と被らなければそれ、被ればいちばん使われていない色（10 色を使い切ったら被ってよい）
 */
export function attachWorktreeHues(store: Pick<WorktreeStores, "worktreeColors">, projectId: number, list: GitWorktree[]): GitWorktree[] {
  const known = store.worktreeColors.of(projectId);
  const mainHue = workplaceDefaultHue(projectId, "");
  const used = [mainHue, ...list.filter((w) => !w.main && !w.prunable && known.has(w.path)).map((w) => known.get(w.path)!)];
  return list.map((w) => {
    if (w.main) return { ...w, hue: mainHue };
    let hue = known.get(w.path);
    if (hue === undefined) {
      const preferred = workplaceDefaultHue(projectId, w.path);
      hue = store.worktreeColors.remember(projectId, w.path, used.includes(preferred) ? pickProjectHue(used) : preferred);
      if (!w.prunable) used.push(hue);
    }
    return { ...w, hue };
  });
}
