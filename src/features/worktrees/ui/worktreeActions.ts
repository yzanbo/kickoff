// worktrees が作業場所の飾り（workplaceDecor の actions）に出す、ワークツリーを作る・消す（履歴の左の一覧の「ワークツリー」と、その行の右クリック）
import { api } from "@/foundation/ui/api";
import { prompt } from "@/foundation/ui/kit/ask";
import type { WorkplaceDecor } from "@/foundation/ui/workplace/workplaceDecor";
import { worktreesStore } from "@/foundation/ui/workplace/worktreesStore";
import { worktreeLabel } from "@/foundation/ui/workplace/WorktreePicker";
import { confirmRemoveWorktree } from "./removeWorktree";

export const worktreeActionsDecor: WorkplaceDecor = {
  id: "worktrees-actions",
  actions: {
    // ブランチの名前を聞く（なければいまのコミットから作る）
    async create(projectId, repoName) {
      const branch = await prompt({
        title: "ワークツリーを作る",
        message: `いまのコミットから新しいブランチを作り、リポジトリの隣の「${repoName}-worktrees」フォルダに取り出します。いまあるブランチの名前なら、そのブランチを取り出します。`,
        label: "ブランチの名前",
        placeholder: "例: feature/login",
        confirmLabel: "作る",
      }).then((r) => r?.value ?? null);
      if (!branch) return false;
      worktreesStore.set(projectId, await api.addWorktree(projectId, branch));
      worktreesStore.invalidate(projectId);
      return true;
    },
    // 消す前に変更・プッシュしていないコミットを知らせ、ブランチも消すかを選んでもらう
    remove: async (projectId, w) => (await confirmRemoveWorktree(projectId, w, worktreeLabel(w))) !== null,
  },
};
