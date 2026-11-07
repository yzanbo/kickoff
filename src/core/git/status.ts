// 作業ツリーの状態（git status）・いまのブランチ・リモートの一覧・参照（HEAD・ブランチ）があるか
import type { GitChangeKind, GitFileChange, GitStatus } from "@shared/types";
import { gitOutput } from "./exec.js";

const KINDS = new Set<GitChangeKind>(["M", "A", "D", "R", "C", "T"]);
export const kindOf = (code: string): GitChangeKind => (KINDS.has(code as GitChangeKind) ? (code as GitChangeKind) : "M");
/** 競合している状態（両方で変更・片方で削除など） */
const CONFLICTS = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

/** 追いかけているブランチとの進み・遅れ（「[ahead 1, behind 2]」の形。git status の見出し・for-each-ref の upstream:track で同じ） */
export function parseAheadBehind(text: string): { ahead: number; behind: number } {
  return { ahead: Number(/ahead (\d+)/.exec(text)?.[1] ?? 0), behind: Number(/behind (\d+)/.exec(text)?.[1] ?? 0) };
}

/** `## main...origin/main [ahead 1, behind 2]` からブランチと進み・遅れを読む */
function parseBranch(line: string): { branch: string | null; upstream: string | null; ahead: number; behind: number } {
  const text = line.replace(/^## /, "");
  const { ahead, behind } = parseAheadBehind(text);
  // コミットがまだないとき: "No commits yet on main"（古い git は "Initial commit on main"）
  const initial = /^(?:No commits yet|Initial commit) on (.+)$/.exec(text);
  if (initial) return { branch: initial[1], upstream: null, ahead, behind };
  if (text.startsWith("HEAD (no branch)")) return { branch: null, upstream: null, ahead, behind };
  const upstream = /\.\.\.(\S+)/.exec(text)?.[1] ?? null;
  return { branch: text.split(/\.\.\.| /)[0] || null, upstream, ahead, behind };
}

/** `git status --porcelain=v1 -z --branch` の出力を読む */
export function parseGitStatus(raw: string): Extract<GitStatus, { repo: true }> {
  const records = raw.split("\0");
  const status: Extract<GitStatus, { repo: true }> = { repo: true, branch: null, upstream: null, has_origin: false, ahead: 0, behind: 0, staged: [], unstaged: [], conflicts: [] };
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    if (record.startsWith("## ")) {
      Object.assign(status, parseBranch(record));
      continue;
    }
    const code = record.slice(0, 2);
    const file = record.slice(3);
    const [x, y] = code;
    // 名前の変更・コピーは、次の区切りに元のパスが入る
    const oldPath = x === "R" || x === "C" || y === "R" || y === "C" ? records[++i] : undefined;
    const change = (kind: GitChangeKind): GitFileChange => (oldPath ? { path: file, old_path: oldPath, kind } : { path: file, kind });
    if (code === "??") status.unstaged.push(change("U"));
    else if (CONFLICTS.has(code)) status.conflicts.push(change("!"));
    else {
      if (x !== " ") status.staged.push(change(kindOf(x)));
      if (y !== " ") status.unstaged.push(change(kindOf(y)));
    }
  }
  return status;
}

/** フォルダが Git で管理されているか（作業ツリーの中か。フォルダがない・Git でなければ false） */
export function isGitWorkTree(repo: string): Promise<boolean> {
  return gitOutput(repo, ["rev-parse", "--is-inside-work-tree"]).then(
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
    return (await gitOutput(dir, ["rev-parse", "--show-prefix"])).trim().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** git status の変更を、リポジトリの中のフォルダ（prefix）の中だけにし、パスをそのフォルダから見た形にする（外から名前を変えたものは、足したものにする） */
export function scopeChanges(changes: GitFileChange[], prefix: string): GitFileChange[] {
  if (!prefix) return changes;
  const head = `${prefix}/`;
  const out: GitFileChange[] = [];
  for (const change of changes) {
    if (!change.path.startsWith(head)) continue;
    const path = change.path.slice(head.length);
    if (change.old_path === undefined) out.push({ ...change, path });
    else if (change.old_path.startsWith(head)) out.push({ ...change, path, old_path: change.old_path.slice(head.length) });
    else out.push({ path, kind: change.kind === "!" ? "!" : "A" });
  }
  return out;
}

/** プロジェクトのフォルダの Git の状態（Git で管理されていなければ repo: false）。リポジトリの中のフォルダなら、その中の変更だけ */
export async function gitStatus(repo: string): Promise<GitStatus> {
  const prefix = await gitPrefix(repo);
  if (prefix === null) return { repo: false };
  const [raw, remotes] = await Promise.all([gitOutput(repo, ["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all", ...(prefix ? ["--", "."] : [])]), listRemotes(repo)]);
  const status = parseGitStatus(raw);
  return {
    ...status,
    staged: scopeChanges(status.staged, prefix),
    unstaged: scopeChanges(status.unstaged, prefix),
    conflicts: scopeChanges(status.conflicts, prefix),
    has_origin: remotes.includes("origin"),
  };
}

/** リモートの名前の一覧（origin など。なければ空） */
export async function listRemotes(repo: string): Promise<string[]> {
  return (await gitOutput(repo, ["remote"])).split("\n").filter(Boolean);
}

/** その参照（HEAD・refs/heads/<ブランチ> など）があるか。HEAD がなければ、まだコミットがない */
export function hasRef(repo: string, ref: string): Promise<boolean> {
  return gitOutput(repo, ["rev-parse", "--verify", "-q", ref]).then(
    () => true,
    () => false,
  );
}

/** いまのブランチ名（ブランチから外れている・Git でないフォルダなら空） */
export async function currentBranch(dir: string): Promise<string> {
  try {
    const name = (await gitOutput(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    return name === "HEAD" ? "" : name;
  } catch {
    return "";
  }
}
