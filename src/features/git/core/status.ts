// 作業ツリーの状態（git status）と途中の操作（参照・ブランチ・remote の読み取りは @/foundation/core/workplace/reads）
import fs from "node:fs";
import path from "node:path";
import type { GitChangeKind, GitFileChange, GitOperation, GitStatus } from "@shared/git/types";
import { gitOutput } from "@/foundation/core/workplace/exec";
import { gitPrefix, listRemotes } from "@/foundation/core/workplace/reads";
import { timed } from "@/foundation/core/system/stallWatch";

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
  const status: Extract<GitStatus, { repo: true }> = { repo: true, branch: null, upstream: null, has_origin: false, ahead: 0, behind: 0, staged: [], unstaged: [], conflicts: [], operation: null };
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

/** 途中の操作と、それがあるときにできる印のファイル（.git の中。ワークツリーなら、そのワークツリーの分） */
const OPERATION_MARKS: [GitOperation, string][] = [
  ["rebase", "rebase-merge"],
  ["rebase", "rebase-apply"],
  ["merge", "MERGE_HEAD"],
  ["cherry-pick", "CHERRY_PICK_HEAD"],
  ["revert", "REVERT_HEAD"],
];

/** 途中で止まっている操作（マージ・リベースなどで衝突して止まっているもの。なければ null） */
export async function gitOperation(repo: string): Promise<GitOperation | null> {
  const out = await gitOutput(repo, ["rev-parse", ...OPERATION_MARKS.flatMap(([, mark]) => ["--git-path", mark])]);
  const paths = out.split("\n").filter(Boolean);
  for (const [i, [operation]] of OPERATION_MARKS.entries()) {
    const mark = paths[i];
    if (mark && fs.existsSync(path.resolve(repo, mark))) return operation;
  }
  return null;
}

/** git status の出力を読む（変更の多い作業場所では数万行。同期の処理なので詰まりの見張りに名前を付ける。system/stallWatch.ts） */
const readStatus = timed("git:status", (raw: string) => parseGitStatus(raw));

/** プロジェクトのフォルダの Git の状態（Git で管理されていなければ repo: false）。リポジトリの中のフォルダなら、その中の変更だけ */
export async function gitStatus(repo: string): Promise<GitStatus> {
  const prefix = await gitPrefix(repo);
  if (prefix === null) return { repo: false };
  const [raw, remotes, operation] = await Promise.all([
    gitOutput(repo, ["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all", ...(prefix ? ["--", "."] : [])]),
    listRemotes(repo),
    gitOperation(repo),
  ]);
  const status = readStatus(raw);
  return {
    ...status,
    staged: scopeChanges(status.staged, prefix),
    unstaged: scopeChanges(status.unstaged, prefix),
    conflicts: scopeChanges(status.conflicts, prefix),
    has_origin: remotes.includes("origin"),
    operation,
  };
}
