import type { Chat } from "@shared/types";
import { useProjects } from "@/stores/projects";
import { useWorktreesOf } from "@/stores/worktrees";
import { workplaceOf } from "@/features/worktree/workplace";

/**
 * チャットのタブに乗せたときの説明: 名前（プロジェクト · グループ: 名前 · ブランチ）。
 * チャットの見出しの行を隠していても、どのプロジェクト・グループ・作業場所のチャットかを確かめられるように（見出しのバッジと同じ中身）。
 * チャットでないタブ（chat が undefined）では undefined
 */
export function useChatTabHint(chat: Chat | undefined, label: string, group: string | undefined): string | undefined {
  const { projectName } = useProjects();
  const worktreesOf = useWorktreesOf(chat ? [chat.project_id] : []);
  if (!chat) return undefined;
  const place = workplaceOf(chat, worktreesOf(chat.project_id));
  const parts = [projectName(chat.project_id), group && `グループ: ${group}`, place.name].filter(Boolean);
  return parts.length > 0 ? `${label}（${parts.join(" · ")}）` : label;
}
