import { Clock, GitBranch, ListTree, type LucideIcon } from "lucide-react";

/**
 * サイドバーのチャット一覧のまとめ方。保存の形式は今までのまま（"recent" / "status"）で、作業場所を足した
 * （以前の「セクション」（"phase"）を覚えていたら、初めの値に戻る）
 */
export const CHAT_GROUPINGS = ["recent", "status", "worktree"] as const;
export type ChatGrouping = (typeof CHAT_GROUPINGS)[number];

/** label: メニューの項目 / short: 見出しの行のボタンに出す、いまの値 */
export const GROUPING_META: Record<ChatGrouping, { label: string; short: string; icon: LucideIcon }> = {
  recent: { label: "新しい順", short: "新しい順", icon: Clock },
  status: { label: "状態でまとめる", short: "状態", icon: ListTree },
  worktree: { label: "作業場所（ブランチ）でまとめる", short: "ブランチ", icon: GitBranch },
};
