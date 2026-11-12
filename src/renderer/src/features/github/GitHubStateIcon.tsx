import { CircleCheck, CircleDot, CircleSlash, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, type LucideIcon } from "lucide-react";
import type { GitHubItem } from "@shared/types";

/** issue・PR の状態の印の種類（色は CSS の .github-state-<tone>） */
export function githubStateOf(item: Pick<GitHubItem, "kind" | "state" | "state_reason" | "is_draft">): { icon: LucideIcon; tone: "open" | "done" | "skipped" | "merged" | "closed" | "draft"; label: string } {
  if (item.kind === "issue") {
    if (item.state === "open") return { icon: CircleDot, tone: "open", label: "開いている" };
    if (item.state_reason === "not_planned" || item.state_reason === "duplicate")
      return { icon: CircleSlash, tone: "skipped", label: item.state_reason === "duplicate" ? "重複として閉じた" : "やらないことにして閉じた" };
    return { icon: CircleCheck, tone: "done", label: "完了して閉じた" };
  }
  if (item.state === "merged") return { icon: GitMerge, tone: "merged", label: "マージ済み" };
  if (item.state === "closed") return { icon: GitPullRequestClosed, tone: "closed", label: "マージせずに閉じた" };
  if (item.is_draft) return { icon: GitPullRequestDraft, tone: "draft", label: "下書き" };
  return { icon: GitPullRequest, tone: "open", label: "開いている" };
}

/** issue・PR の状態の印（一覧の行・中身の見出し） */
export function GitHubStateIcon({ item, size = 15 }: { item: Pick<GitHubItem, "kind" | "state" | "state_reason" | "is_draft">; size?: number }) {
  const { icon: Icon, tone, label } = githubStateOf(item);
  return <Icon size={size} className={`github-state github-state-${tone}`} aria-label={label} data-tip={label} />;
}

/** 状態の札（中身の見出し。印 ＋ 名前） */
export function GitHubStateChip({ item }: { item: Pick<GitHubItem, "kind" | "state" | "state_reason" | "is_draft"> }) {
  const { icon: Icon, tone, label } = githubStateOf(item);
  return (
    <span className={`github-state-chip github-state-${tone}`}>
      <Icon size={14} aria-hidden />
      {label}
    </span>
  );
}
