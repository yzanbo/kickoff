// worktrees が拡張点に出すもの（app/renderer/registry.ts が入れる）: ワークツリーを読む・作る口・下の帯のブランチ・作業場所の飾り（ワークツリーの実行環境・帯・作る / 消す）・ゴミ箱の控えの行
import { footerItems } from "@/foundation/ui/shell/points";
import { workplaceDecor } from "@/foundation/ui/workplace/workplaceDecor";
import { worktreeSources } from "@/foundation/ui/workplace/worktreesStore";
import { worktreesApi } from "./api/worktrees";
import { branchFooterItem } from "./footerItems";
import { worktreesDecor } from "./workplaceDecor";
import { trashKinds } from "@/features/trash/ui";
import { worktreeTrashKind } from "./trashKind";

const source = {
  list: worktreesApi.gitWorktrees,
  add: worktreesApi.addWorktree,
  suggestBranches: (projectId: number, summary: string) => worktreesApi.suggestBranches(projectId, summary).then((r) => r.branches),
};

export const contributes = [worktreeSources.item(source), footerItems.item(branchFooterItem), workplaceDecor.item(worktreesDecor), trashKinds.item(worktreeTrashKind)];
