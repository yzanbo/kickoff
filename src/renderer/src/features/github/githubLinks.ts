// GitHub の本文の中のリンクを Kickoff の中で開くかの見分け・本文の画像を読む先と、GitHub のページの URL（純粋関数）
import { GITHUB_DEFAULT_HOST, githubWebOrigin, normalizeGitHubHost } from "@shared/github/host";
import { githubSearchQuery } from "@shared/github/searchQuery";
import { isFileOfRepo, repoFileOfUrl } from "@shared/github/repoImage";
import type { GitHubLink, GitHubListFilter } from "@shared/types";

/** issue・PR の URL（https://ホスト/持ち主/名前/issues|pull/番号。後ろの /files・?…・#… は問わない） */
const ITEM_URL = /^https:\/\/([^/?#]+)\/([^/?#]+\/[^/?#]+)\/(issues|pull)\/(\d+)(?:[/?#].*)?$/i;

/**
 * リンク先が、いま見ているリポジトリ（host のホストの repo。「持ち主/名前」）の issue・PR なら、その種類と番号（Kickoff の GitHub タブで開く）。
 * ほかのホスト・リポジトリ・issue / PR でないページ（コミット・ファイル・ユーザーなど）は null（外のブラウザで開く）
 */
export function githubItemRef(href: string, repo: string, host: string = GITHUB_DEFAULT_HOST): Pick<GitHubLink, "kind" | "number"> | null {
  const m = ITEM_URL.exec(href.trim());
  if (!m || !repo || normalizeGitHubHost(m[1]) !== normalizeGitHubHost(host) || m[2].toLowerCase() !== repo.toLowerCase()) return null;
  const number = Number(m[4]);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  return { kind: m[3].toLowerCase() === "pull" ? "pr" : "issue", number };
}

/** リポジトリの GitHub のページ（https://ホスト/持ち主/名前） */
export const githubRepoUrl = (host: string, repo: string) => `${githubWebOrigin(host)}/${repo}`;

/**
 * いまの一覧を GitHub で開く URL（issue は /issues、PR は /pulls に、同じ絞り込みの検索の文を q で渡す。
 * そのリポジトリのページなので、検索の文の頭の「repo:持ち主/名前」は外す）
 */
export function githubListUrl(host: string, repo: string, filter: GitHubListFilter): string {
  const q = githubSearchQuery(repo, filter).replace(/^repo:\S+\s*/, "");
  return `${githubRepoUrl(host, repo)}/${filter.kind === "pr" ? "pulls" : "issues"}?q=${encodeURIComponent(q)}`;
}

/** 本文を描くときの、いま見ている issue・PR のホスト・リポジトリ（「持ち主/名前」。分からなければ null）・プロジェクト */
export interface GitHubBodyPlace {
  host: string;
  repo: string | null;
  projectId: number | null;
}

/**
 * 本文の画像を読む先: 連携先のリポジトリの中のファイルを指すもの（非公開のリポジトリは鍵がないと読めない）はコアの口
 * （GET /api/projects/:id/github/image。コアが gh api で取る）、ほかはそのまま（貼った画像は署名つきの URL で鍵なしで読める）
 */
export function githubImageSource(place: GitHubBodyPlace, url: string): string {
  const file = place.repo && place.projectId !== null ? repoFileOfUrl(url, place.host) : null;
  return file && place.repo && isFileOfRepo(file, place.repo) ? `/api/projects/${place.projectId}/github/image?url=${encodeURIComponent(url)}` : url;
}
