import { Clock, GitBranch, Layers, ListTree, type LucideIcon } from "lucide-react";

/**
 * サイドバーのチャット一覧のまとめ方。保存の形式は今までのまま（"recent" / "status"）で、作業場所・セクションを足した
 */
export const CHAT_GROUPINGS = ["recent", "status", "worktree", "phase"] as const;
export type ChatGrouping = (typeof CHAT_GROUPINGS)[number];

/** label: メニューの項目 / short: 見出しの行のボタンに出す、いまの値 */
export const GROUPING_META: Record<ChatGrouping, { label: string; short: string; icon: LucideIcon }> = {
  recent: { label: "新しい順", short: "新しい順", icon: Clock },
  status: { label: "状態でまとめる", short: "状態", icon: ListTree },
  worktree: { label: "作業場所（ブランチ）でまとめる", short: "ブランチ", icon: GitBranch },
  phase: { label: "セクションでまとめる", short: "セクション", icon: Layers },
};
