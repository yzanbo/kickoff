import type { Chat } from "@shared/types";
import { useWorktrees } from "@/stores/worktrees";
import { branchName, workplaceOf, type ChatWorkplace } from "./workplace";
import { workplaceHue } from "./workplaceHue";

/** 本体がいまいるブランチ（分からないうち・Git でないフォルダは null。ブランチから外れていれば "HEAD a1b2c3d"） */
export function useMainBranch(projectId: number): string | null {
  const main = useWorktrees(projectId)?.find((w) => w.main);
  return main ? branchName(main) : null;
}

/** チャットの作業場所とブランチ（workplaceOf を、そのプロジェクトのワークツリーの一覧で求める）と、作業場所の色（workplaceHue。タブの作業場所別のまとまりと同じ色） */
export function useChatWorkplace(chat: Pick<Chat, "project_id" | "worktree_path" | "branch">): { place: ChatWorkplace; hue: number } {
  const list = useWorktrees(chat.project_id);
  const place = workplaceOf(chat, list);
  return { place, hue: workplaceHue(chat.project_id, place, list) };
}
