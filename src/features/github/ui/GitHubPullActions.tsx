import "./GitHubPullActions.css";
import { GitBranch, GitMerge } from "lucide-react";
import type { GitHubPullDetail } from "@shared/github/types";
import { checkoutPull, useMainRunningChats } from "./githubCheckout";
import { openMergeDialog } from "./MergeDialog";

/**
 * PR の見出しの操作: 「チェックアウト」（新しいワークツリー / 本体を選んで取り出す。githubCheckout.ts）と、
 * 開いていてマージできるアカウントなら「マージ…」（いつも確認を挟む MergeDialog）。マージしたら onChanged（中身を取り直す）
 */
export function GitHubPullActions({ projectId, detail, onChanged }: { projectId: number; detail: GitHubPullDetail; onChanged: () => void }) {
  const running = useMainRunningChats(projectId);
  const open = detail.item.state === "open";
  return (
    <span className="github-pull-actions">
      {open && (
        <button type="button" className="btn" data-size="sm" data-tip="PR のブランチを手元に取り出す（新しいワークツリー / 本体を選ぶ）" onClick={() => void checkoutPull(projectId, detail, running)}>
          <GitBranch size={13} aria-hidden /> チェックアウト
        </button>
      )}
      {open && detail.can_merge && (
        <button type="button" className="btn btn-primary" data-size="sm" onClick={() => openMergeDialog(projectId, detail, onChanged)}>
          <GitMerge size={13} aria-hidden /> マージ…
        </button>
      )}
    </span>
  );
}
