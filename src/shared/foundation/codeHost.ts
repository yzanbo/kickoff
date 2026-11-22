// GitHub のホスト（github.com。GitHub Enterprise ならそのホスト）。連携先・アカウント・gh・画面の URL は、すべてホストを受け取って組み立てる。
// いま Kickoff が GitHub として扱うのは github.com だけ（GITHUB_HOSTS）。Enterprise を足すときの手順はその JSDoc
/** github.com（ホストを決めていないときの既定） */
export const GITHUB_DEFAULT_HOST = "github.com";

/**
 * Kickoff が GitHub として扱うホスト（いまは github.com だけ）。GitHub Enterprise を足すときは、ここに足す（ほかの所はホストを受け取って動く）。
 * 残りの手順: ① この一覧を gh にログインしているホスト（gh auth status --json hosts のキー）から作る ② アカウントの一覧（listGitHubAccounts）を連携先のホストで出す
 * ③ git と AI のチャットに渡すトークン（k.workplace.git・turn.ts の githubEnvForGit()）に連携先のホストを渡す ④ githubStatus のホスト
 * ⑤ 画面の CSP（src/app/renderer/index.html の img-src）に本文の画像のホストを足す
 */
export const GITHUB_HOSTS: readonly string[] = [GITHUB_DEFAULT_HOST];

/** ホストを比べる形（小文字。純粋な関数） */
export const normalizeGitHubHost = (host: string) => host.trim().toLowerCase();

/** GitHub として扱うホストか（hosts の既定は GITHUB_HOSTS。純粋な関数） */
export const isGitHubHost = (host: string, hosts: readonly string[] = GITHUB_HOSTS) => hosts.some((h) => normalizeGitHubHost(h) === normalizeGitHubHost(host));

/**
 * git の remote の URL を、ホストと「持ち主」「名前」に分ける（https・ssh://・git@ の形。読めなければ null。純粋な関数）。
 * ホストは小文字にそろえる
 */
export function parseRemoteUrl(url: string): { host: string; owner: string; name: string } | null {
  const m =
    /^https?:\/\/(?:[^@/]+@)?([^/:@\s]+)(?::\d+)?\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url.trim()) ??
    /^ssh:\/\/(?:[^@/]+@)?([^/:@\s]+)(?::\d+)?\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url.trim()) ??
    /^[^@/:\s]+@([^/:@\s]+):([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url.trim());
  return m ? { host: normalizeGitHubHost(m[1]), owner: m[2], name: m[3] } : null;
}

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
