// リポジトリの中のファイル（一覧・読む・保存・検索）。パスはリポジトリの外を指さないか必ず確かめる
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isInside } from "../system/paths.js";
import { Conflict, Invalid, NotFound } from "../http/errors.js";
import type { FileContent, ProjectFiles, ProjectSearchQuery, ProjectSearchResult, RenamedFile, SavedFile } from "@shared/types";
import { gitOutput, nulList } from "./exec.js";
import { gitStatus } from "./status.js";

/** ファイルの一覧の上限（大きなリポジトリでも重くならないように） */
const MAX_FILES = 20_000;
/** ファイルの中身を返す上限（バイト） */
export const MAX_FILE_BYTES = 1_000_000;

/** リポジトリの中のパスか（外のファイルを読ませない）。リポジトリの中の絶対パスを返す */
export async function assertInside(repo: string, file: string): Promise<string> {
  const root = await fs.realpath(repo);
  const target = path.resolve(root, file);
  if (path.isAbsolute(file) || target === root || !isInside(root, target)) throw new Invalid("リポジトリの外のファイルです");
  return target;
}

/**
 * エクスプローラーに出すファイルの一覧（Git で管理していなければ 400）。
 * 管理しているファイルと、まだ追加していないファイル（消したファイルは除く）。.gitignore で無視しているものは、
 * フォルダなら中を開かずにまとめて返す（node_modules などを全部たどらないように）
 */
export async function listProjectFiles(repo: string): Promise<ProjectFiles> {
  if ((await gitStatus(repo)).repo === false) throw new Invalid("このプロジェクトフォルダは、Git で管理されていません");
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

/** リポジトリの中の、実体のパス（リポジトリの外を指すシンボリックリンクは使わせない。なければ 404） */
async function resolveInside(repo: string, file: string): Promise<string> {
  const real = await fs.realpath(await assertInside(repo, file)).catch((e: unknown) => {
    if ((e as { code?: unknown }).code === "ENOENT") throw new NotFound(`ファイルが見つかりません: ${file}`);
    throw e;
  });
  await assertInside(repo, path.relative(await fs.realpath(repo), real));
  return real;
}

/**
 * ファイルを保存する（いまあるファイルだけ）。baseHash は開いたときの指紋で、いまの中身と違えば上書きせずに
 * 409 にする（開いたあとで、ほかで（エージェントなどが）変えていた。エージェントの作業を消さないため）。null なら確かめずに上書きする
 */
export async function writeProjectFile(repo: string, file: string, content: string, baseHash: string | null): Promise<SavedFile> {
  const real = await resolveInside(repo, file);
  if (!(await fs.stat(real)).isFile()) throw new Invalid("ファイルではありません");
  if (baseHash !== null && hashOf(await fs.readFile(real)) !== baseHash) {
    throw new Conflict("開いたあとで、ほかでファイルが変わりました");
  }
  const data = Buffer.from(content, "utf8");
  await fs.writeFile(real, data);
  return { hash: hashOf(data) };
}

/**
 * ファイル・フォルダの名前を変える（同じフォルダの中で。ファイルタブ・変更タブの Enter・右クリックの「名前を変更」）。
 * 名前に区切り（/ \）・「.」「..」は使えない（400）。もうない（404）・同じ名前のものがある（409）なら変えない。
 * リポジトリの外を指すシンボリックリンクの先は動かさない（リンクそのものの名前を変える）
 */
export async function renameProjectFile(repo: string, file: string, name: string): Promise<RenamedFile> {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || /[/\\\0]/.test(trimmed)) throw new Invalid("その名前は使えません");
  const from = await assertInside(repo, file);
  await fs.lstat(from).catch((e: unknown) => {
    if ((e as { code?: unknown }).code === "ENOENT") throw new NotFound(`ファイルが見つかりません: ${file}`);
    throw e;
  });
  const to = path.join(path.dirname(from), trimmed);
  if (to === from) return { path: file };
  // 大文字・小文字だけを変えるとき（macOS では同じファイルとみなされる）は、同じものがあるとは言わない
  const existing = await fs.lstat(to).catch(() => null);
  if (existing && to.toLowerCase() !== from.toLowerCase()) throw new Conflict(`「${trimmed}」はもうあります`);
  await fs.rename(from, to);
  const root = await fs.realpath(repo);
  return { path: path.relative(root, to).split(path.sep).join("/") };
}

/** ファイルの中身（リポジトリの外を指すシンボリックリンクは読まない） */
export async function readProjectFile(repo: string, file: string): Promise<FileContent> {
  const real = await resolveInside(repo, file);
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw new Invalid("ファイルではありません");
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
 * 探せなければ 400（正規表現の書き方が正しくないときは、そう伝える）
 */
export async function searchProject(repo: string, { query, case_sensitive: caseSensitive, whole_word: wholeWord, regex }: ProjectSearchQuery): Promise<ProjectSearchResult> {
  const result: ProjectSearchResult = { files: [], total: 0, truncated: false };
  if (!query) return result;
  // --no-full-name: リポジトリの中のフォルダでは、そのフォルダから見たパスで返す（設定の grep.fullName に左右されない）
  const args = ["grep", "-n", "--column", "-I", "--untracked", "--no-full-name", "-z", `--max-count=${MAX_MATCHES_PER_FILE}`];
  if (!caseSensitive) args.push("-i");
  if (wholeWord) args.push("-w");
  args.push(regex ? "-E" : "-F", "-e", query);
  // 見つからなければ終了コード 1
  const out = await gitOutput(repo, args, [1]).catch(() => {
    throw new Invalid(regex ? "正規表現の書き方が正しくありません" : "検索できませんでした");
  });
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
