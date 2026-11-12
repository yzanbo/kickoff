// GitHub の本文の中のリンクを Kickoff の中で開くかの見分け（純粋関数）
import type { GitHubLink } from "@shared/types";

/** issue・PR の URL（https://github.com/持ち主/名前/issues|pull/番号。後ろの /files・?…・#… は問わない） */
const ITEM_URL = /^https:\/\/github\.com\/([^/?#]+\/[^/?#]+)\/(issues|pull)\/(\d+)(?:[/?#].*)?$/i;

/**
 * リンク先が、いま見ているリポジトリ（repo。「持ち主/名前」）の issue・PR なら、その種類と番号（Kickoff の GitHub タブで開く）。
 * ほかのリポジトリ・issue / PR でないページ（コミット・ファイル・ユーザーなど）は null（外のブラウザで開く）
 */
export function githubItemRef(href: string, repo: string): Pick<GitHubLink, "kind" | "number"> | null {
  const m = ITEM_URL.exec(href.trim());
  if (!m || !repo || m[1].toLowerCase() !== repo.toLowerCase()) return null;
  const number = Number(m[3]);
  if (!Number.isSafeInteger(number) || number <= 0) return null;
  return { kind: m[2].toLowerCase() === "pull" ? "pr" : "issue", number };
}
