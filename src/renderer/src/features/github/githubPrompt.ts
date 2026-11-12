// GitHub の issue・PR を AI に渡す文（新しいチャット・チャットに追加・レビューコメントで直すの入力欄に入れる。送るのは自分で）
import type { GitHubIssueDetail, GitHubLink, GitHubPullDetail, GitHubReviewThread, GitHubUser } from "@shared/types";

const KIND_NAMES = { issue: "issue", pr: "PR" } as const;

const who = (user: GitHubUser | null) => (user ? `@${user.login}` : "（不明）");
const day = (iso: string) => iso.slice(0, 10);

/** 本文（空なら「（本文なし）」） */
const bodyOf = (markdown: string) => markdown.trim() || "（本文なし）";

/** 結び付ける issue・PR（URL の「持ち主/名前」と番号・種類） */
export function linkOf(detail: GitHubIssueDetail): GitHubLink {
  const m = /github\.com\/([^/]+\/[^/]+)\//.exec(detail.item.url);
  return { repo: m ? m[1] : "", number: detail.item.number, kind: detail.item.kind };
}

/** 見出しの 1 行（「issue #12「題名」（URL）」） */
const headOf = (detail: GitHubIssueDetail) => `${KIND_NAMES[detail.item.kind]} #${detail.item.number}「${detail.item.title}」（${detail.item.url}）`;

/** スレッド 1 つ（ファイルと行・コメントを順に） */
function threadText(thread: GitHubReviewThread): string {
  const line = thread.line ?? thread.original_line;
  const place = `${thread.path}${line !== null ? `:${line}` : ""}${thread.side === "LEFT" ? "（消した側の行）" : ""}${thread.outdated ? "（古い差分へのコメント）" : ""}`;
  const comments = thread.comments.map((c) => `- ${who(c.author)}: ${c.body_markdown.trim().replace(/\n/g, "\n  ")}`);
  return [`### ${place}`, ...comments].join("\n");
}

/**
 * issue・PR の題名・本文・コメントをすべて入れた文（新しいチャット・チャットに追加）。
 * PR のレビューは本文のあるものだけ、行のスレッドは解決していないものを後ろに添える
 */
export function itemPrompt(detail: GitHubIssueDetail | GitHubPullDetail): string {
  const lines = [`GitHub の ${headOf(detail)}について対応してください。`, "", "## 本文", "", bodyOf(detail.body_markdown)];
  const comments = detail.timeline.flatMap((e) =>
    e.type === "comment" || (e.type === "review" && e.body_markdown.trim()) ? [`### ${who(e.author)}（${day(e.created_at)}）${e.type === "review" ? " のレビュー" : ""}\n\n${e.body_markdown.trim()}`] : [],
  );
  if (comments.length > 0) lines.push("", "## コメント", "", comments.join("\n\n"));
  if (detail.timeline_truncated) lines.push("", "（コメントが多いので途中までです。続きは URL で見てください）");
  const threads = "review_threads" in detail ? detail.review_threads.filter((t) => !t.resolved) : [];
  if (threads.length > 0) lines.push("", "## 解決していない行のコメント", "", threads.map(threadText).join("\n\n"));
  return lines.join("\n");
}

/** レビューコメントで直す文（解決していない行のスレッドのファイル・行・コメント。threads を渡せばそれだけ） */
export function reviewFixPrompt(detail: GitHubPullDetail, threads: GitHubReviewThread[] = detail.review_threads.filter((t) => !t.resolved)): string {
  const head = `GitHub の ${headOf(detail)}のレビューコメントに対応して、コードを直してください。直したらコミットしてください。`;
  return [head, "", "## 行のコメント", "", threads.map(threadText).join("\n\n")].join("\n");
}

/** 1 つのスレッドを渡す文（スレッドごとの「AI に渡す」） */
export function threadPrompt(detail: GitHubPullDetail, thread: GitHubReviewThread): string {
  return [`GitHub の ${headOf(detail)}の次のレビューコメントに対応してください。`, "", threadText(thread)].join("\n");
}
