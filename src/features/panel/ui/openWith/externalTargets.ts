// パネルのタブの列からターミナルを開くときの、開く先の決め方（useOpenWithMenu が使う。押したペインで見せている表示中のタブの作業場所から決める）
import { baseName } from "@/foundation/ui/lib/format";
import type { WorkplaceAt } from "@/features/panel/ui/kind";
import type { TerminalTarget } from "@/features/panel/ui/tabs/panelTypes";

/**
 * ターミナルを開く場所: 見せているタブの作業場所（種類の workplaceOf。ワークツリーならそのフォルダ、本体ならプロジェクトのフォルダ）、
 * なければ開く場所が 1 つならそこ。決まらなければ undefined（開く場所を選ぶメニューを出す）
 */
export function terminalTargetOf(at: WorkplaceAt | undefined, targets: readonly TerminalTarget[]): TerminalTarget | undefined {
  if (at) {
    if (at.worktree) return { cwd: at.worktree, label: baseName(at.worktree), projectId: at.projectId };
    const main = targets.find((t) => t.projectId === at.projectId);
    if (main) return main;
  }
  return targets.length === 1 ? targets[0] : undefined;
}
