// 作業場所の共通の読み取り（参照・ブランチ・remote・退避・変更の数・追跡と無視）。手元だけの git で読む（remote には触らない）
import os from "node:os";
import { Invalid } from "@/foundation/core/errors";
import { git } from "./git";

/** その参照（HEAD・refs/heads/<ブランチ> など）があるか。HEAD がなければ、まだコミットがない */
export function hasRef(repo: string, ref: string): Promise<boolean> {
  return git(repo).ok(["rev-parse", "--verify", "-q", ref]);
}

/** フォルダが Git で管理されているか（作業ツリーの中か。フォルダがない・Git でなければ false） */
export function isGitWorkTree(dir: string): Promise<boolean> {
  return git(dir).run(["rev-parse", "--is-inside-work-tree"]).then(
    (out) => out.trim() === "true",
    () => false,
  );
}

/**
 * フォルダがリポジトリの一番上から見てどこにあるか（「app/web」の形。一番上なら空。Git でなければ null）。
 * プロジェクトのフォルダはリポジトリの中のフォルダでもよく、そのときは Git の操作をこの中だけに絞る
 */
export async function gitPrefix(dir: string): Promise<string | null> {
  try {
    return (await git(dir).text(["rev-parse", "--show-prefix"])).replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** リモートの名前の一覧（origin など。なければ空） */
export function listRemotes(repo: string): Promise<string[]> {
  return git(repo).lines(["remote"]);
}

/** いまのブランチ名（ブランチから外れている・Git でないフォルダなら null） */
export async function currentBranch(dir: string): Promise<string | null> {
  const name = await git(dir).maybe(["rev-parse", "--abbrev-ref", "HEAD"]);
  const trimmed = name.trim();
  return trimmed && trimmed !== "HEAD" ? trimmed : null;
}

/** HEAD のコミット（まだコミットがない・Git でなければ null） */
export async function headSha(dir: string): Promise<string | null> {
  return (await git(dir).maybe(["rev-parse", "--verify", "-q", "HEAD"])).trim() || null;
}

/** ancestor が of に含まれるか（どちらかがなければ false） */
export function isAncestor(repo: string, ancestor: string, of: string): Promise<boolean> {
  return git(repo).ok(["merge-base", "--is-ancestor", ancestor, of]);
}

/** ブランチの追いかけている先（remote とその中のブランチ名。remote の名前に「/」があっても、remote の一覧の長いものから当てて割る）。なければ null */
export async function upstreamOf(repo: string, branch: string): Promise<{ remote: string; branch: string } | null> {
  const upstream = (await git(repo).maybe(["rev-parse", "--abbrev-ref", `${branch}@{upstream}`])).trim();
  if (!upstream) return null;
  const remotes = await listRemotes(repo).catch((): string[] => []);
  const remote = remotes.sort((a, b) => b.length - a.length).find((r) => upstream.startsWith(`${r}/`));
  return remote ? { remote, branch: upstream.slice(remote.length + 1) } : null;
}

/** 退避（stash）の一覧（新しい順。ref は "stash@{0}" の形） */
export async function readStashes(repo: string): Promise<{ ref: string; sha: string; message: string }[]> {
  const lines = await git(repo).lines(["stash", "list", "--format=%gd%x00%H%x00%gs"]);
  return lines.map((line) => {
    const [ref = "", sha = "", message = ""] = line.split("\0");
    return { ref, sha, message };
  });
}

/** コミットしていない変更の数（git status の行。scope を渡すとその中だけ） */
export async function changedCount(dir: string, opts: { scope?: string } = {}): Promise<number> {
  return (await git(dir).lines(["status", "--porcelain", ...(opts.scope ? ["--", opts.scope] : [])])).length;
}

/** Git が追いかけているファイルか */
export function isTracked(dir: string, file: string): Promise<boolean> {
  return git(dir).ok(["ls-files", "--error-unmatch", "--", file]);
}

/** .gitignore などで無視するファイル・フォルダか */
export function isIgnored(dir: string, file: string): Promise<boolean> {
  return git(dir).ok(["check-ignore", "-q", "--", file]);
}

/** 本体とワークツリーで共通の .git のフォルダ（絶対パス。Git でなければ CommandError） */
export function gitCommonDir(dir: string): Promise<string> {
  return git(dir).text(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
}

/** remote の名前と URL（取ってくる先の URL。なければ空） */
export async function readRemotes(repo: string): Promise<{ name: string; url: string }[]> {
  const remotes = new Map<string, string>();
  for (const line of await git(repo).lines(["remote", "-v"])) {
    const m = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line);
    if (m && !remotes.has(m[1])) remotes.set(m[1], m[2]);
  }
  return [...remotes].map(([name, url]) => ({ name, url }));
}

/** リポジトリの一番上のフォルダ（Git でなければ null） */
export async function repoTop(dir: string): Promise<string | null> {
  return (await git(dir).maybe(["rev-parse", "--show-toplevel"])).trim() || null;
}

/** 新しいブランチの名前に使えるか（git の決まりと、オプションと取り違える「-」で始まる名前。リポジトリの外で確かめる） */
export async function isBranchName(name: string): Promise<boolean> {
  return !name.startsWith("-") && (await git(os.tmpdir()).ok(["check-ref-format", "--branch", name]));
}

/** 新しいブランチの名前に使えなければ Invalid（isBranchName） */
export async function assertBranchName(name: string): Promise<void> {
  if (!(await isBranchName(name))) throw new Invalid(`ブランチ名に使えない文字が入っています: ${name}`);
}
