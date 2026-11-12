// GitHub の本文の中のリンクを Kickoff の中で開くかの見分け（純粋関数）
import { GITHUB_DEFAULT_HOST, normalizeGitHubHost } from "@shared/github/host";
import type { GitHubLink } from "@shared/types";

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
