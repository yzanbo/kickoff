// GitHub タブの一覧の絞り込みを、GitHub の検索の書き方（search の q）にする。コアが GitHub に聞くときと、画面に「この条件で探しています」を出すときで同じものを使う
import type { GitHubKind, GitHubListFilter, GitHubMineFilter } from "../types/github";

/** 既定の絞り込み（開いているもの・更新が新しい順） */
export function defaultGitHubFilter(kind: GitHubKind): GitHubListFilter {
  return { kind, state: "open", mine: null, labels: [], assignee: null, milestone: null, text: "", sort: "updated" };
}

/** 種類ごとに出す「自分」の絞り込み（issue にレビュー依頼はない） */
export function mineFiltersFor(kind: GitHubKind): GitHubMineFilter[] {
  return kind === "issue" ? ["assigned", "created", "mentioned"] : ["created", "review_requested", "assigned", "mentioned"];
}

const MINE_QUALIFIERS: Record<GitHubMineFilter, string> = {
  assigned: "assignee:@me",
  created: "author:@me",
  review_requested: "review-requested:@me",
  mentioned: "mentions:@me",
};

/** 検索の値（空白・記号を含めば "…" で囲む。中の " は除く） */
export function searchValue(value: string): string {
  const v = value.replaceAll('"', "").trim();
  return /^[\w.@/-]+$/.test(v) ? v : `"${v}"`;
}

/** 絞り込み → 検索の文（repo は「持ち主/名前」）。PR の「閉じた」はマージしていないものだけ（マージ済みは別に選ぶ） */
export function githubSearchQuery(repo: string, f: GitHubListFilter): string {
  const parts = [`repo:${repo}`, f.kind === "issue" ? "is:issue" : "is:pr"];
  if (f.state === "open") parts.push("is:open");
  else if (f.state === "closed") parts.push(f.kind === "pr" ? "is:closed is:unmerged" : "is:closed");
  else if (f.state === "merged" && f.kind === "pr") parts.push("is:merged");
  if (f.mine && !(f.kind === "issue" && f.mine === "review_requested")) parts.push(MINE_QUALIFIERS[f.mine]);
  for (const label of f.labels) parts.push(`label:${searchValue(label)}`);
  if (f.assignee) parts.push(`assignee:${searchValue(f.assignee)}`);
  if (f.milestone) parts.push(`milestone:${searchValue(f.milestone)}`);
  parts.push(`sort:${f.sort}-desc`);
  const text = f.text.trim();
  if (text) parts.push(text);
  return parts.join(" ");
}
