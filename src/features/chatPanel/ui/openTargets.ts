// 新しいチャットを始める行き先（open({ kind: "newChat" })）
import type { OpenTargetHandler } from "@/foundation/ui/navigation/open";
import { navigate } from "@/foundation/ui/navigation/router";

declare module "@/foundation/ui/navigation/open" {
  interface OpenTargetMap {
    /** 新しいチャット（プロジェクトのボードへ移り、右側のパネルで始める。groupId・worktree は始めるグループ・作業場所） */
    newChat: { projectId: number; groupId?: number | null; worktree?: string | null };
  }
}

export const newChatTarget: OpenTargetHandler<"newChat"> = {
  kind: "newChat",
  open({ projectId, groupId, worktree }, { replace }) {
    navigate({ name: "newChat", projectId, ...(groupId ? { group: groupId } : {}), ...(worktree ? { worktree } : {}) }, { replace });
    return true;
  },
};
