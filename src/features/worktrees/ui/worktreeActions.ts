// worktrees が作業場所の飾り（workplaceDecor の actions）に出す、ワークツリーを作る・消す（履歴の左の一覧の「ワークツリー」と、その行の右クリック）
import { worktreesApi } from "@/features/worktrees/ui/api/worktrees";
import type { WorkplaceActions } from "@/foundation/ui/workplace/workplaceDecor";
import { askNewWorktreeBranch } from "@/foundation/ui/workplace/WorkplacePicker";
import { worktreesStore } from "@/foundation/ui/workplace/worktreesStore";
import { worktreeLabel } from "@/foundation/ui/workplace/WorktreePicker";
import { confirmRemoveWorktree } from "./removeWorktreeFlow";

export const worktreeActions: WorkplaceActions = {
  // ブランチの名前を聞く（ほかの入口と同じ確認。AI の提案つき）
  async create(projectId) {
    const branch = await askNewWorktreeBranch(projectId);
    if (!branch) return false;
    worktreesStore.set(projectId, await worktreesApi.addWorktree(projectId, branch));
    worktreesStore.invalidate(projectId);
    return true;
  },
  // 消す前に変更・プッシュしていないコミットを知らせ、ブランチも消すかを選んでもらう
  remove: async (projectId, w) => (await confirmRemoveWorktree(projectId, w, worktreeLabel(w))) !== null,
};
