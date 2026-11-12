// GitHub の issue・PR を AI に渡すもの（入力欄に入れる一言と、押した時点の中身の札にする Markdown。送るのは自分で）
import type { AttachmentSource, GitHubIssueDetail, GitHubLink, GitHubPullDetail, GitHubReviewThread, GitHubUser } from "@shared/types";
import { quoteComment } from "@/features/chat/messages/quoteComment";

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

/** 札の出どころ（「o/r#12 題名」。番号があるので AI が gh で読み直せる）。review ならレビューコメント */
export function sourceOf(detail: GitHubIssueDetail, review = false): AttachmentSource {
  const { repo, number } = linkOf(detail);
  const label = `${repo}#${number} ${detail.item.title}`;
  return { type: review ? "github_review" : detail.item.kind === "pr" ? "github_pull" : "github_issue", label: review ? `${label} のレビューコメント` : label, url: detail.item.url };
}

/** 札のファイル名（issue-12.md / pr-12.md。レビューコメントは pr-12-review.md） */
export const captureNameOf = (detail: GitHubIssueDetail, review = false) => `${detail.item.kind === "pr" ? "pr" : "issue"}-${detail.item.number}${review ? "-review" : ""}.md`;

/** 入力欄に入れる一言（書き換えられる。中身は札にある） */
export function handOffText(detail: GitHubIssueDetail): string {
  return `GitHub の ${KIND_NAMES[detail.item.kind]} #${detail.item.number}「${detail.item.title}」に対応してください。`;
}

/**
 * issue・PR の題名・本文・コメントをすべて入れた Markdown（「AI に渡す」の札の中身）。
 * PR のレビューは本文のあるものだけ、行のスレッドは解決していないものを後ろに添える
 */
export function itemDocument(detail: GitHubIssueDetail | GitHubPullDetail): string {
  const lines = [`# GitHub の ${headOf(detail)}`, "", "## 本文", "", bodyOf(detail.body_markdown)];
  const comments = detail.timeline.flatMap((e) =>
    e.type === "comment" || (e.type === "review" && e.body_markdown.trim()) ? [`### ${who(e.author)}（${day(e.created_at)}）${e.type === "review" ? " のレビュー" : ""}\n\n${e.body_markdown.trim()}`] : [],
  );
  if (comments.length > 0) lines.push("", "## コメント", "", comments.join("\n\n"));
  if (detail.timeline_truncated) lines.push("", "（コメントが多いので途中までです。続きは URL で見てください）");
  const threads = "review_threads" in detail ? detail.review_threads.filter((t) => !t.resolved) : [];
  if (threads.length > 0) lines.push("", "## 解決していない行のコメント", "", threads.map(threadText).join("\n\n"));
  return lines.join("\n");
}

/** レビューコメントで直すときの一言（中身は札にある） */
export function reviewFixText(detail: GitHubPullDetail): string {
  return `GitHub の PR #${detail.item.number}「${detail.item.title}」のレビューコメントに対応して、コードを直してください。直したらコミットしてください。`;
}

/** レビューコメントの札の中身（解決していない行のスレッドのファイル・行・コメント。threads を渡せばそれだけ） */
export function reviewDocument(detail: GitHubPullDetail, threads: GitHubReviewThread[] = detail.review_threads.filter((t) => !t.resolved)): string {
  return [`# GitHub の ${headOf(detail)}のレビューコメント`, "", "## 行のコメント", "", threads.map(threadText).join("\n\n")].join("\n");
}

/** 本文・コメントで選んだ文を引用して足す文（どの issue・PR の文かを頭に添える。右クリックの「チャットに追加」） */
export function quotePrompt(detail: GitHubIssueDetail, quote: string): string {
  return `GitHub の ${headOf(detail)}より:\n${quoteComment(quote, "")}`;
}
