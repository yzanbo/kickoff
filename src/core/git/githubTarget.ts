// プロジェクトの連携先の GitHub のリポジトリ（git の remote から決める。fork なら元のリポジトリ（upstream）を先に選ぶ）
import type { GitHubRemote } from "@shared/types";
import { gitOutput } from "./exec.js";

/** remote の URL から GitHub の「持ち主/名前」を読む（GitHub でなければ null。https・ssh・git@ の形。純粋な関数） */
export function parseGitHubRepo(url: string): string | null {
  const m = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com(?::\d+)?\/|git@github\.com:)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

/** git remote -v の出力から、GitHub の remote の一覧を作る（取ってくる側の URL。同じ名前は 1 つ。純粋な関数） */
export function parseGitHubRemotes(out: string): GitHubRemote[] {
  const remotes: GitHubRemote[] = [];
  for (const line of out.split("\n")) {
    const m = /^(\S+)\t(\S+) \(fetch\)$/.exec(line.trim());
    if (!m || remotes.some((r) => r.name === m[1])) continue;
    const repo = parseGitHubRepo(m[2]);
    if (repo) remotes.push({ name: m[1], repo, url: m[2] });
  }
  return remotes;
}

/**
 * 自動で選ぶ連携先（gh と同じ順: gh repo set-default で決めたもの → upstream → origin → ほかの最初のもの。なければ null。純粋な関数）。
 * fork なら upstream（元のリポジトリ）に PR を出し、issue・PR もそこを見る
 */
export function autoGitHubRemote(remotes: GitHubRemote[], ghDefault: string | null): GitHubRemote | null {
  return (
    remotes.find((r) => r.name === ghDefault) ?? remotes.find((r) => r.name === "upstream") ?? remotes.find((r) => r.name === "origin") ?? remotes[0] ?? null
  );
}

/** GitHub の remote の一覧と、gh repo set-default で決めた remote（git config の remote.<名前>.gh-resolved = base） */
export async function readGitHubRemotes(repo: string): Promise<{ remotes: GitHubRemote[]; ghDefault: string | null }> {
  const [remotes, resolved] = await Promise.all([
    gitOutput(repo, ["remote", "-v"]).then(parseGitHubRemotes, () => []),
    gitOutput(repo, ["config", "--get-regexp", "^remote\\..*\\.gh-resolved$"], [1]).catch(() => ""),
  ]);
  const base = resolved
    .split("\n")
    .map((line) => /^remote\.(.+)\.gh-resolved (\S+)$/.exec(line.trim()))
    .find((m) => m && m[2] === "base");
  return { remotes, ghDefault: base ? base[1] : null };
}

/** gh に渡す連携先（repo = 「持ち主/名前」。headOwner = 手元のブランチをプッシュする先（origin）の持ち主。fork からの PR の head に使う） */
export interface GitHubTarget {
  repo: string;
  headOwner: string;
}

/**
 * 連携先を決める（chosen = プロジェクトで選んだ remote の名前。null・もうない remote なら自動）。GitHub の remote がなければ null。
 * 手元のブランチは origin にプッシュするので、head の持ち主は origin（なければ連携先）の持ち主
 */
export function pickGitHubTarget(remotes: GitHubRemote[], ghDefault: string | null, chosen: string | null): GitHubTarget | null {
  const target = remotes.find((r) => r.name === chosen) ?? autoGitHubRemote(remotes, ghDefault);
  if (!target) return null;
  const push = remotes.find((r) => r.name === "origin") ?? target;
  return { repo: target.repo, headOwner: ownerOf(push.repo) };
}

/** 「持ち主/名前」の持ち主 */
export const ownerOf = (repo: string) => repo.split("/")[0];

/** プロジェクトの連携先（git の remote を読んで決める） */
export async function resolveGitHubTarget(repo: string, chosen: string | null): Promise<GitHubTarget | null> {
  const { remotes, ghDefault } = await readGitHubRemotes(repo);
  return pickGitHubTarget(remotes, ghDefault, chosen);
}
