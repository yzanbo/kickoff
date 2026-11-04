import type { Chat } from "@shared/types";
import { useWorktrees } from "@/stores/worktrees";
import { branchName, workplaceOf, type ChatWorkplace } from "./workplace";

/** 本体がいまいるブランチ（分からないうち・Git でないフォルダは null。ブランチから外れていれば "HEAD a1b2c3d"） */
export function useMainBranch(projectId: number): string | null {
  const main = useWorktrees(projectId)?.find((w) => w.main);
  return main ? branchName(main) : null;
}

/** チャットの作業場所とブランチ（workplaceOf を、そのプロジェクトのワークツリーの一覧で求める） */
export function useChatWorkplace(chat: Pick<Chat, "project_id" | "worktree_path" | "branch">): ChatWorkplace {
  return workplaceOf(chat, useWorktrees(chat.project_id));
}
