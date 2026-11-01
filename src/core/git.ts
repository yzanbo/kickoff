import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { FileContent, GitChangeKind, GitDiff, GitFileChange, GitStatus, ProjectFiles, ProjectSearchQuery, ProjectSearchResult } from "./types.js";

const execFileAsync = promisify(execFile);

/** 差分を返す上限（これより大きければ途中で切る） */
const MAX_DIFF_CHARS = 400_000;
/** ファイルの一覧の上限（大きなリポジトリでも重くならないように） */
const MAX_FILES = 20_000;
/** ファイルの中身を返す上限（バイト） */
const MAX_FILE_BYTES = 1_000_000;

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

/** リポジトリの中のパスか（外のファイルを読ませない）。リポジトリの中の絶対パスを返す */
async function assertInside(repo: string, file: string): Promise<string> {
  const root = await fs.realpath(repo);
  const target = path.resolve(root, file);
  if (path.isAbsolute(file) || !target.startsWith(root + path.sep)) throw new Error("リポジトリの外のファイルです");
  return target;
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

const nulList = (out: string) => out.split("\0").filter(Boolean);

/**
 * エクスプローラーに出すファイルの一覧（Git で管理していなければ null）。
 * 管理しているファイルと、まだ追加していないファイル（消したファイルは除く）。.gitignore で無視しているものは、
 * フォルダなら中を開かずにまとめて返す（node_modules などを全部たどらないように）
 */
export async function listProjectFiles(repo: string): Promise<ProjectFiles | null> {
  if ((await gitStatus(repo)).repo === false) return null;
  const [all, deleted, ignored] = await Promise.all([
    gitOutput(repo, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]),
    gitOutput(repo, ["ls-files", "--deleted", "-z"]),
    gitOutput(repo, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"]),
  ]);
  const gone = new Set(nulList(deleted));
  const files = [...new Set(nulList(all))].filter((f) => !gone.has(f)).sort();
  return {
    files: files.slice(0, MAX_FILES),
    ignored: nulList(ignored).map((p) => (p.endsWith("/") ? { path: p.slice(0, -1), dir: true } : { path: p, dir: false })),
    truncated: files.length > MAX_FILES,
  };
}

/** 中身の指紋（保存の前に、開いたあとでほかで変わっていないか比べる） */
const hashOf = (data: Buffer) => createHash("sha1").update(data).digest("hex");

/** リポジトリの中の、実体のパス（リポジトリの外を指すシンボリックリンクは使わせない） */
async function resolveInside(repo: string, file: string): Promise<string> {
  const real = await fs.realpath(await assertInside(repo, file));
  await assertInside(repo, path.relative(await fs.realpath(repo), real));
  return real;
}

/** 開いたあとで、ほかで（エージェントなどが）ファイルを変えていた */
export class FileConflictError extends Error {}

/**
 * ファイルを保存する（いまあるファイルだけ）。baseHash は開いたときの指紋で、いまの中身と違えば上書きせずに
 * FileConflictError にする（エージェントの作業を消さないため）。null なら確かめずに上書きする
 */
export async function writeProjectFile(repo: string, file: string, content: string, baseHash: string | null): Promise<{ hash: string }> {
  const real = await resolveInside(repo, file);
  if (!(await fs.stat(real)).isFile()) throw new Error("ファイルではありません");
  if (baseHash !== null && hashOf(await fs.readFile(real)) !== baseHash) {
    throw new FileConflictError("開いたあとで、ほかでファイルが変わりました");
  }
  const data = Buffer.from(content, "utf8");
  await fs.writeFile(real, data);
  return { hash: hashOf(data) };
}

/** ファイルの中身（リポジトリの外を指すシンボリックリンクは読まない） */
export async function readProjectFile(repo: string, file: string): Promise<FileContent> {
  const real = await resolveInside(repo, file);
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw new Error("ファイルではありません");
  const handle = await fs.open(real, "r");
  try {
    const buffer = Buffer.alloc(Math.min(stat.size, MAX_FILE_BYTES));
    await handle.read(buffer, 0, buffer.length, 0);
    // 先頭に NUL があればバイナリとみなす（git と同じ考え方）
    const binary = buffer.subarray(0, 8000).includes(0);
    const truncated = stat.size > MAX_FILE_BYTES;
    return { content: binary ? "" : buffer.toString("utf8"), hash: binary || truncated ? "" : hashOf(buffer), binary, truncated };
  } finally {
    await handle.close();
  }
}

/** 検索で返す行の上限・1 ファイルあたりの上限・1 行の長さの上限 */
const MAX_MATCHES = 2000;
const MAX_MATCHES_PER_FILE = 200;
const MAX_LINE_CHARS = 400;

/**
 * プロジェクトのファイルの中を探す（git grep。.gitignore で無視しているもの・バイナリは除く。未追加のファイルは含める）。
 * 正規表現の書き方が正しくなければ失敗する
 */
export async function searchProject(repo: string, { query, caseSensitive, wholeWord, regex }: ProjectSearchQuery): Promise<ProjectSearchResult> {
  const result: ProjectSearchResult = { files: [], total: 0, truncated: false };
  if (!query) return result;
  const args = ["grep", "-n", "--column", "-I", "--untracked", "-z", `--max-count=${MAX_MATCHES_PER_FILE}`];
  if (!caseSensitive) args.push("-i");
  if (wholeWord) args.push("-w");
  args.push(regex ? "-E" : "-F", "-e", query);
  // 見つからなければ終了コード 1
  const out = await gitOutput(repo, args, [1]);
  for (const record of out.split("\n")) {
    if (!record) continue;
    const [file, line, column, ...rest] = record.split("\0");
    if (result.total >= MAX_MATCHES) {
      result.truncated = true;
      break;
    }
    const text = rest.join("\0");
    let entry = result.files.at(-1);
    if (entry?.path !== file) result.files.push((entry = { path: file, matches: [] }));
    entry.matches.push({ line: Number(line), column: Number(column), text: text.length > MAX_LINE_CHARS ? text.slice(0, MAX_LINE_CHARS) : text });
    result.total++;
  }
  return result;
}
