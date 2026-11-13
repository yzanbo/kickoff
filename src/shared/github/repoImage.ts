// issue・PR の本文の画像のうち、リポジトリの中のファイルを指すもの（非公開のリポジトリでは鍵がないと読めないので、コアが gh api で取って返す）。
// 本文に貼った画像（private-user-images.githubusercontent.com の署名つきの URL）は鍵なしで読めるので、ここでは扱わない
import { isDefaultGitHubHost, normalizeGitHubHost } from "./host";

/** リポジトリの中のファイル（ref はブランチ・タグ・コミット） */
export interface GitHubRepoFile {
  owner: string;
  name: string;
  ref: string;
  path: string;
}

/** ref とパスに分ける（refs/heads/… と refs/tags/… は 3 段を ref に。ほかは 1 段目。「.」「..」・空の段は null） */
function refAndPath(segments: string[]): { ref: string; path: string } | null {
  const refLength = segments[0] === "refs" && (segments[1] === "heads" || segments[1] === "tags") ? 3 : 1;
  const ref = segments.slice(0, refLength).join("/");
  const rest = segments.slice(refLength);
  if (!ref || rest.length === 0 || rest.some((s) => s === "" || s === "." || s === "..")) return null;
  return { ref, path: rest.join("/") };
}

/**
 * 画像の URL がリポジトリの中のファイルを指すなら、その場所（host は issue・PR のホスト。純粋な関数）。
 * https://<host>/<持ち主>/<名前>/raw/<ref>/<パス>・…/blob/<ref>/<パス>?raw=true・https://raw.githubusercontent.com/<持ち主>/<名前>/<ref>/<パス>（github.com のときだけ）
 */
export function repoFileOfUrl(url: string, host: string): GitHubRepoFile | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  let segments: string[];
  try {
    segments = u.pathname.split("/").slice(1).map(decodeURIComponent);
  } catch {
    return null;
  }
  if (segments.some((s) => s.includes("/"))) return null;
  const urlHost = normalizeGitHubHost(u.host);
  let owner: string | undefined;
  let name: string | undefined;
  let rest: string[];
  if (urlHost === normalizeGitHubHost(host)) {
    const [o, n, kind, ...more] = segments;
    const raw = kind === "raw" || (kind === "blob" && (u.searchParams.get("raw") === "true" || u.searchParams.get("raw") === "1"));
    if (!raw) return null;
    [owner, name, rest] = [o, n, more];
  } else if (urlHost === "raw.githubusercontent.com" && isDefaultGitHubHost(host)) {
    const [o, n, ...more] = segments;
    [owner, name, rest] = [o, n, more];
  } else return null;
  if (!owner || !name) return null;
  const at = refAndPath(rest);
  return at && { owner, name, ...at };
}

/** そのファイルが「持ち主/名前」のリポジトリのものか（大文字・小文字は問わない） */
export const isFileOfRepo = (file: GitHubRepoFile, repo: string) => `${file.owner}/${file.name}`.toLowerCase() === repo.toLowerCase();
