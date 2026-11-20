// リポジトリの中のファイル（一覧・読む・保存・作る・名前の変更・ゴミ箱）。操作は土台の folderFiles（ノートと同じ口）で、パスはリポジトリの外を指さないか必ず確かめる
import fs from "node:fs/promises";
import path from "node:path";
import { Invalid } from "@/foundation/core/errors";
import { folderFiles, type FolderFiles } from "@/foundation/core/files/folderFiles";
import { imageFileType, isIcnsFile, MAX_IMAGE_FILE_BYTES } from "@shared/files/imageFiles";
import type { FileContent, RenamedFile, SavedFile } from "@shared/foundation/fileTypes";
import type { ProjectFiles } from "@shared/git/types";
import { gitOutput, nulList } from "@/foundation/core/workplace/exec";
import { largestIcnsPng } from "./icns";
import { plainLsFiles } from "@/foundation/core/workplace/plainFolder";
import { isGitWorkTree } from "@/foundation/core/workplace/reads";
import { timed } from "@/foundation/core/system/stallWatch";

export { hashOf, MAX_FILE_BYTES } from "@/foundation/core/files/folderFiles";

/** ファイルの一覧の上限（大きなリポジトリでも重くならないように） */
const MAX_FILES = 20_000;
/** 空のフォルダを探すときに読むフォルダの数の上限 */
const MAX_DIR_READS = 5000;

/** ページのプレビュー（HTML のファイル）が読むファイルの上限 */
const MAX_ASSET_BYTES = 30 * 1024 * 1024;

/** リポジトリ（作業場所）の中のファイルの操作 */
const repoFiles = (repo: string): FolderFiles => folderFiles(repo, { outsideMessage: "リポジトリの外のファイルです", maxAssetBytes: MAX_ASSET_BYTES });

/** リポジトリの中のパスか（外のファイルを読ませない）。リポジトリの中の絶対パスを返す */
export function assertInside(repo: string, file: string): Promise<string> {
  return repoFiles(repo).inside(file);
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
  const { files, ignoredEntries } = readLsFiles(all, deleted, ignored);
  return {
    files: files.slice(0, MAX_FILES),
    ignored: ignoredEntries,
    empty_dirs: files.length > MAX_FILES ? [] : await emptyDirs(repo, files, ignoredEntries.map((e) => e.path)),
    truncated: files.length > MAX_FILES,
  };
}

/** ls-files の出力を一覧にする（大きなリポジトリでは数万行。同期の処理なので詰まりの見張りに名前を付ける） */
const readLsFiles = timed("git:ls-files", (all: string, deleted: string, ignored: string) => {
  const gone = new Set(nulList(deleted));
  const files = [...new Set(nulList(all))].filter((f) => !gone.has(f)).sort();
  const ignoredEntries = nulList(ignored).map((p) => (p.endsWith("/") ? { path: p.slice(0, -1), dir: true } : { path: p, dir: false }));
  return { files, ignoredEntries };
});

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
  await repoFiles(repo).create(file, { dir });
  return { path: file };
}

/** ファイル・フォルダをゴミ箱へ入れる（ファイルタブの右クリックの「ゴミ箱に入れる」。入れ方は trash に任せる。ないものは 404） */
export function trashProjectFile<T>(repo: string, file: string, trash: (target: string) => Promise<T>): Promise<T> {
  return repoFiles(repo).trash(file, trash);
}

/** リポジトリの中の、実体のパス（リポジトリの外を指すシンボリックリンクは使わせない。なければ 404） */
export function resolveInside(repo: string, file: string): Promise<string> {
  return repoFiles(repo).resolve(file);
}

/**
 * ファイルを保存する（いまあるファイルだけ）。baseHash は開いたときの指紋で、いまの中身と違えば上書きせずに
 * 409 にする（開いたあとで、ほかで（エージェントなどが）変えていた。エージェントの作業を消さないため）。null なら確かめずに上書きする
 */
export function writeProjectFile(repo: string, file: string, content: string, baseHash: string | null): Promise<SavedFile> {
  return repoFiles(repo).write(file, content, baseHash);
}

/**
 * ファイル・フォルダの名前を変える（同じフォルダの中で。ファイルタブ・変更タブの Enter・右クリックの「名前を変更」）。
 * 名前に区切り（/ \）・「.」「..」は使えない（400）。もうない（404）・同じ名前のものがある（409）なら変えない。
 * リポジトリの外を指すシンボリックリンクの先は動かさない（リンクそのものの名前を変える）
 */
export async function renameProjectFile(repo: string, file: string, name: string): Promise<RenamedFile> {
  return { path: await repoFiles(repo).rename(file, name) };
}

/** ファイルの中身（リポジトリの外を指すシンボリックリンクは読まない） */
export function readProjectFile(repo: string, file: string): Promise<FileContent> {
  return repoFiles(repo).read(file);
}

/** 作業場所のファイルの中身をそのまま読む（HTML のファイルのプレビューと、そのページが相対パスで読む CSS・画像。作業場所の外は断る） */
export function readProjectAsset(repo: string, file: string): Promise<Buffer> {
  return repoFiles(repo).asset(file);
}

/**
 * 画像のファイルの中身（ファイルタブのプレビュー。リポジトリの外を指すリンクは読まない）。画像でない・大きすぎるは 400。
 * icns はブラウザで出せないので、中のいちばん大きい PNG を返す（PNG がなければ 400）
 */
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
