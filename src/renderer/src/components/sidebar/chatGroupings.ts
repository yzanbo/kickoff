import { Clock, GitBranch, Layers, ListTree, type LucideIcon } from "lucide-react";

/**
 * サイドバーのチャット一覧のまとめ方。保存の形式は今までのまま（"recent" / "status"）で、作業場所・セクションを足した
 */
export const CHAT_GROUPINGS = ["recent", "status", "worktree", "phase"] as const;
export type ChatGrouping = (typeof CHAT_GROUPINGS)[number];

export const GROUPING_META: Record<ChatGrouping, { label: string; icon: LucideIcon }> = {
  recent: { label: "新しい順", icon: Clock },
  status: { label: "状態でまとめる", icon: ListTree },
  worktree: { label: "作業場所（ブランチ）でまとめる", icon: GitBranch },
  phase: { label: "セクションでまとめる", icon: Layers },
};
