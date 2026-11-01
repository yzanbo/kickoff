import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { GitChangeKind, GitDiff, GitFileChange, GitStatus } from "./types.js";

const execFileAsync = promisify(execFile);

/** 差分を返す上限（これより大きければ途中で切る） */
const MAX_DIFF_CHARS = 400_000;

/**
 * git を実行して標準出力をそのまま返す。okCodes の終了コードは失敗にしない
 * （git diff --no-index は差があると 1 で終わる）
 */
export async function gitOutput(cwd: string, args: string[], okCodes: number[] = []): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, timeout: 30_000, maxBuffer: 20 * 1024 * 1024 });
    return stdout;
  } catch (e) {
    const err = e as { code?: unknown; stdout?: unknown };
    if (typeof err.code === "number" && okCodes.includes(err.code) && typeof err.stdout === "string") return err.stdout;
    throw e;
  }
}

const KINDS = new Set<GitChangeKind>(["M", "A", "D", "R", "C", "T"]);
const kindOf = (code: string): GitChangeKind => (KINDS.has(code as GitChangeKind) ? (code as GitChangeKind) : "M");
/** 競合している状態（両方で変更・片方で削除など） */
const CONFLICTS = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

/** `## main...origin/main [ahead 1, behind 2]` からブランチと進み・遅れを読む */
function parseBranch(line: string): { branch: string | null; ahead: number; behind: number } {
  const text = line.replace(/^## /, "");
  const ahead = Number(/ahead (\d+)/.exec(text)?.[1] ?? 0);
  const behind = Number(/behind (\d+)/.exec(text)?.[1] ?? 0);
  // コミットがまだないとき: "No commits yet on main"（古い git は "Initial commit on main"）
  const initial = /^(?:No commits yet|Initial commit) on (.+)$/.exec(text);
  if (initial) return { branch: initial[1], ahead, behind };
  if (text.startsWith("HEAD (no branch)")) return { branch: null, ahead, behind };
  return { branch: text.split(/\.\.\.| /)[0] || null, ahead, behind };
}

/** `git status --porcelain=v1 -z --branch` の出力を読む */
export function parseGitStatus(raw: string): Extract<GitStatus, { repo: true }> {
  const records = raw.split("\0");
  const status: Extract<GitStatus, { repo: true }> = { repo: true, branch: null, ahead: 0, behind: 0, staged: [], unstaged: [], conflicts: [] };
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

/** プロジェクトのフォルダの Git の状態（Git で管理されていなければ repo: false） */
export async function gitStatus(repo: string): Promise<GitStatus> {
  const inside = await gitOutput(repo, ["rev-parse", "--is-inside-work-tree"]).then(
    (out) => out.trim() === "true",
    () => false,
  );
  if (!inside) return { repo: false };
  return parseGitStatus(await gitOutput(repo, ["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"]));
}

/** リポジトリの中のパスか（外のファイルを読ませない） */
async function assertInside(repo: string, file: string) {
  const root = await fs.realpath(repo);
  const target = path.resolve(root, file);
  if (path.isAbsolute(file) || !target.startsWith(root + path.sep)) throw new Error("リポジトリの外のファイルです");
}

/**
 * 1 つのファイルの差分。staged ならステージされている分、そうでなければまだステージしていない分。
 * 未追跡のファイルは、空のファイルとの差分（すべて追加）にする。oldPath は名前を変えたときの元のパス
 */
export async function gitDiff(repo: string, file: string, staged: boolean, oldPath?: string): Promise<GitDiff> {
  await assertInside(repo, file);
  if (oldPath) await assertInside(repo, oldPath);
  const paths = oldPath ? ["--", oldPath, file] : ["--", file];
  const base = ["diff", "--no-color", "--no-ext-diff", "-M"];
  let diff = await gitOutput(repo, staged ? [...base, "--cached", ...paths] : [...base, ...paths]);
  if (!staged && !diff) {
    const untracked = await gitOutput(repo, ["ls-files", "--others", "--exclude-standard", "--", file]);
    if (untracked.trim()) diff = await gitOutput(repo, ["diff", "--no-color", "--no-ext-diff", "--no-index", "--", "/dev/null", file], [1]);
  }
  const binary = /^Binary files .* differ$/m.test(diff) || diff.includes("GIT binary patch");
  const truncated = diff.length > MAX_DIFF_CHARS;
  return { diff: truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff, binary, truncated };
}
