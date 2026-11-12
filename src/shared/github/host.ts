// GitHub のホスト（github.com。GitHub Enterprise ならそのホスト）。連携先・アカウント・gh・画面の URL は、すべてホストを受け取って組み立てる。
// いま Kickoff が GitHub として扱うのは github.com だけ（core/git/githubTarget.ts の GITHUB_HOSTS）。Enterprise を足すときの手順は src/core/CLAUDE.md
/** github.com（ホストを決めていないときの既定） */
export const GITHUB_DEFAULT_HOST = "github.com";

/** ホストを比べる形（小文字。純粋な関数） */
export const normalizeGitHubHost = (host: string) => host.trim().toLowerCase();

/** github.com か（Enterprise でない。純粋な関数） */
export const isDefaultGitHubHost = (host: string) => normalizeGitHubHost(host) === GITHUB_DEFAULT_HOST;

/** ホストの Web のページの頭（https://ホスト。純粋な関数） */
export const githubWebOrigin = (host: string) => `https://${normalizeGitHubHost(host)}`;

/** URL のホスト（読めなければ null。純粋な関数） */
export function githubHostOfUrl(url: string): string | null {
  try {
    return normalizeGitHubHost(new URL(url).host) || null;
  } catch {
    return null;
  }
}
