import { GitBranch } from "lucide-react";
import type { Chat } from "@shared/types";
import { cx } from "@/lib/cx";
import { useChatWorkplace } from "./worktreeBranches";

/**
 * チャットが作業しているブランチの印（すべてのチャットに出す）。ワークツリーで作業しているチャットは色を付け、本体のチャットは控えめにする。
 * ワークツリーのフォルダが見つからない・片付けて本体に戻ったチャットは、最後に作業したブランチを点線の枠で出す（説明に理由）
 */
export function WorktreeChip({ chat }: { chat: Pick<Chat, "project_id" | "worktree_path" | "branch"> }) {
  const place = useChatWorkplace(chat);
  if (!place.name) return null;
  return (
    <span className={cx("worktree-chip", place.kind === "main" && "on-main", (place.kind === "missing" || place.kind === "past") && "is-gone")} title={place.title}>
      <GitBranch size={11} aria-hidden />
      {place.name}
    </span>
  );
}
