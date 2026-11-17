import { workplaceDefaultHue } from "@shared/project/colors";
import type { GitWorktree } from "@shared/types";
import type { ChatWorkplace } from "./workplace";

/**
 * 作業場所の色（色相）。ブランチの印（WorktreeChip）と、タブを作業場所別にまとめたときのまとまりの色（workplaceHead の hue）で同じ色にする。
 * 色はコアが一覧に付けた色（GitWorktree の hue）: 本体はプロジェクトから決まる色、ワークツリーは初めて見たときに決めて覚えた色で、
 * ブランチを替えても・ほかのワークツリーを足したり消したりしても変わらない（core/worktrees/colors.ts）。
 * 一覧にないもの（フォルダなし）とまだ一覧を読んでいないときは、キーから決まる色（本体はコアと同じ色になる）
 */
export function workplaceHue(projectId: number, place: Pick<ChatWorkplace, "key">, list: GitWorktree[] | undefined): number {
  return list?.find((w) => (w.main ? "" : w.path) === place.key)?.hue ?? workplaceDefaultHue(projectId, place.key);
}
