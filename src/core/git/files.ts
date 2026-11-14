// リポジトリの中のファイル（一覧・読む・保存・作る・名前の変更・ゴミ箱）。パスはリポジトリの外を指さないか必ず確かめる
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { isInside, relativeApiPath } from "../system/paths.js";
import { Conflict, Invalid, NotFound } from "../http/errors.js";
import { imageFileType, isIcnsFile, MAX_IMAGE_FILE_BYTES } from "@shared/files/imageFiles";
import type { FileContent, ProjectFiles, RenamedFile, SavedFile } from "@shared/types";
import { gitOutput, nulList } from "./exec.js";
import { largestIcnsPng } from "./icns.js";
import { plainLsFiles } from "./plainFolder.js";
import { isGitWorkTree } from "./status.js";

/** ファイルの一覧の上限（大きなリポジトリでも重くならないように） */
const MAX_FILES = 20_000;
/** 空のフォルダを探すときに読むフォルダの数の上限 */
const MAX_DIR_READS = 5000;
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
 * エクスプローラーに出すファイルの一覧。
 * 管理しているファイルと、まだ追加していないファイル（消したファイルは除く）。.gitignore で無視しているものは、
 * フォルダなら中を開かずにまとめて返す（node_modules などを全部たどらないように）。
 * Git で管理していないフォルダも、中のファイルを同じ形で返す（.gitignore も読む。node_modules などはいつも無視しているものにする。plainFolder.ts）
 */
export async function listProjectFiles(repo: string): Promise<ProjectFiles> {
  const lsFiles = (await isGitWorkTree(repo)) ? (args: string[]) => gitOutput(repo, ["ls-files", ...args]) : (args: string[]) => plainLsFiles(repo, args);
  const [all, deleted, ignored] = await Promise.all([
    lsFiles(["--cached", "--others", "--exclude-standard", "-z"]),
    lsFiles(["--deleted", "-z"]),
    lsFiles(["--others", "--ignored", "--exclude-standard", "--directory", "-z"]),
  ]);
  const gone = new Set(nulList(deleted));
  const files = [...new Set(nulList(all))].filter((f) => !gone.has(f)).sort();
  const ignoredEntries = nulList(ignored).map((p) => (p.endsWith("/") ? { path: p.slice(0, -1), dir: true } : { path: p, dir: false }));
  return {
    files: files.slice(0, MAX_FILES),
    ignored: ignoredEntries,
    empty_dirs: files.length > MAX_FILES ? [] : await emptyDirs(repo, files, ignoredEntries.map((e) => e.path)),
    truncated: files.length > MAX_FILES,
  };
}

/**
 * ファイルの一覧に出てこないフォルダ（空のフォルダ。Git はフォルダを覚えないので ls-files には出ない）。
 * ファイルのあるフォルダを読み、その中の、ファイルも無視しているものもないフォルダを空とみなす（その中も同じように読む）。
 * ファイルタブの「新しいフォルダー」で作ったばかりのフォルダを木に出すため
 */
async function emptyDirs(repo: string, files: string[], ignored: string[]): Promise<string[]> {
  const known = new Set<string>([""]);
  for (const file of files) {
    for (let slash = file.lastIndexOf("/"); slash > 0; slash = file.lastIndexOf("/", slash - 1)) known.add(file.slice(0, slash));
  }
  const skip = new Set([...files, ...ignored]);
  const found: string[] = [];
  const queue = [...known];
  for (let reads = 0; queue.length > 0 && reads < MAX_DIR_READS; reads++) {
    const dir = queue.shift() ?? "";
    const entries = await fs.readdir(path.join(repo, dir), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const child = dir ? `${dir}/${entry.name}` : entry.name;
      if (!entry.isDirectory() || entry.name === ".git" || known.has(child) || skip.has(child)) continue;
      found.push(child);
      queue.push(child);
    }
  }
  return found.sort();
}

/**
 * 新しいファイル・フォルダを作る（ファイルタブの右クリックの「新しいファイル」「新しいフォルダー」）。
 * 途中のフォルダもなければ作る（"a/b.ts" と書けば a の中に作る）。「.」「..」の段・リポジトリの外は 400、同じ名前のものがあれば 409
 */
export async function createProjectFile(repo: string, file: string, dir: boolean): Promise<RenamedFile> {
  const parts = file.split("/");
  if (parts.some((p) => !p.trim() || p === "." || p === ".." || /[\\\0]/.test(p))) throw new Invalid("その名前は使えません");
  const target = await assertInside(repo, file);
  if (await fs.lstat(target).catch(() => null)) throw new Conflict(`「${parts.at(-1)}」はもうあります`);
  // いまある途中のフォルダが、リンクで外を指していないか（作ったものがリポジトリの外に出ないように）
  const root = await fs.realpath(repo);
  let existing = path.dirname(target);
  while (!(await fs.lstat(existing).catch(() => null))) existing = path.dirname(existing);
  const real = await fs.realpath(existing);
  if (!isInside(root, real)) throw new Invalid("リポジトリの外のファイルです");
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (dir) await fs.mkdir(target);
  else await fs.writeFile(target, "", { flag: "wx" });
  return { path: file };
}

/** ファイル・フォルダをゴミ箱へ入れる（ファイルタブの右クリックの「ゴミ箱に入れる」。入れ方は trash に任せる。ないものは 404） */
export async function trashProjectFile<T>(repo: string, file: string, trash: (target: string) => Promise<T>): Promise<T> {
  const target = await assertInside(repo, file);
  await fs.lstat(target).catch((e: unknown) => {
    if ((e as { code?: unknown }).code === "ENOENT") throw new NotFound(`ファイルが見つかりません: ${file}`);
    throw e;
  });
  return trash(target);
}

/** 中身の指紋（保存の前に、開いたあとでほかで変わっていないか比べる） */
export const hashOf = (data: Buffer) => createHash("sha1").update(data).digest("hex");

/** リポジトリの中の、実体のパス（リポジトリの外を指すシンボリックリンクは使わせない。なければ 404） */
export async function resolveInside(repo: string, file: string): Promise<string> {
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
  return { path: relativeApiPath(root, to) };
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


/**
 * 画像のファイルの中身（ファイルタブのプレビュー。リポジトリの外を指すリンクは読まない）。画像でない・大きすぎるは 400。
 * icns はブラウザで出せないので、中のいちばん大きい PNG を返す（PNG がなければ 400）
 */
/** ページのプレビュー（HTML のファイル）が読むファイルの上限 */
const MAX_ASSET_BYTES = 30 * 1024 * 1024;

/** 作業場所のファイルの中身をそのまま読む（HTML のファイルのプレビューと、そのページが相対パスで読む CSS・画像。作業場所の外は断る） */
export async function readProjectAsset(repo: string, file: string): Promise<Buffer> {
  const real = await resolveInside(repo, file);
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw new Invalid("ファイルではありません");
  if (stat.size > MAX_ASSET_BYTES) throw new Invalid(`ファイルが大きすぎます（上限 ${MAX_ASSET_BYTES / 1024 / 1024} MB）`);
  return fs.readFile(real);
}

export async function readProjectImage(repo: string, file: string): Promise<{ data: Buffer; type: string }> {
  const type = imageFileType(file);
  if (!type) throw new Invalid("画像のファイルではありません");
  const real = await resolveInside(repo, file);
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw new Invalid("ファイルではありません");
  if (stat.size > MAX_IMAGE_FILE_BYTES) throw new Invalid(`画像が大きすぎます（上限 ${MAX_IMAGE_FILE_BYTES / 1024 / 1024} MB）`);
  const data = await fs.readFile(real);
  if (!isIcnsFile(file)) return { data, type };
  const png = largestIcnsPng(data);
  if (!png) throw new Invalid("このアイコンには、表示できる形（PNG）の画像が入っていません");
  return { data: png, type };
}
