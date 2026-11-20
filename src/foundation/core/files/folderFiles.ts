// フォルダの中のファイルの操作（読む・保存・作る・名前の変更・動かす・ゴミ箱へ・中身をそのまま）。ファイルのタブとノートが同じ口を使う。
// パスは root からの相対（区切りは /）で受け、外を指さないか（リンクの先も）必ず確かめる
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { FileContent, SavedFile } from "@shared/foundation/fileTypes";
import { baseName, isUnder } from "@shared/foundation/path";
import { Conflict, Invalid, NotFound } from "@/foundation/core/errors";
import { isInside, relativeApiPath } from "@/foundation/core/system/paths";

export interface FolderFilesOptions {
  /** 外を指したときの文（「リポジトリの外のファイルです」「ノートのフォルダの外のファイルです」） */
  outsideMessage: string;
  /** asset で読む上限（バイト） */
  maxAssetBytes: number;
  /** 「.」で始まる名前を作る・動かす・ゴミ箱へ入れる・名前に使うのを断る（ノート） */
  rejectDotNames?: boolean;
}

export interface FolderFiles {
  readonly root: string;
  /** 中のパスか（字面）。中の絶対パスを返す。外・root そのものは Invalid */
  inside(rel: string): Promise<string>;
  /** リンクをたどった実体も中か（実体のパスを返す）。なければ NotFound */
  resolve(rel: string): Promise<string>;
  exists(rel: string): Promise<boolean>;
  /** 中身（MAX_FILE_BYTES まで。NUL があればバイナリ） */
  read(rel: string): Promise<FileContent>;
  /** いまあるファイルを保存する。baseHash（開いたときの指紋）といまの中身が違えば Conflict（null なら確かめない） */
  write(rel: string, content: string, baseHash: string | null): Promise<SavedFile>;
  /** 作る（途中のフォルダも作る。同じ名前があれば Conflict。いまある途中のフォルダのリンクが外を指せば Invalid） */
  create(rel: string, kind: { dir: boolean; content?: string }): Promise<void>;
  /** 同じフォルダの中で名前を変える（大文字・小文字だけの変更は許す）。変えたあとの相対パスを返す */
  rename(rel: string, name: string): Promise<string>;
  /** ほかのフォルダへ動かす（フォルダをその中へは動かさない。行き先に同じ名前があれば Conflict。大文字・小文字だけなら動かす） */
  move(from: string, to: string): Promise<void>;
  /** 中身をそのまま（実体も中・上限まで。ファイルでなければ NotFound） */
  asset(rel: string): Promise<Buffer>;
  /** ゴミ箱へ（なければ NotFound。入れ方は put に任せる） */
  trash<T>(rel: string, put: (abs: string) => Promise<T>): Promise<T>;
}

/** 中身を返す上限（バイト） */
export const MAX_FILE_BYTES = 1_000_000;

/** 中身の指紋（保存の前に、開いたあとでほかで変わっていないか比べる） */
export const hashOf = (data: Uint8Array) => createHash("sha1").update(data).digest("hex");

/** なければ NotFound にする（ほかの失敗はそのまま） */
const notFound = (rel: string) => (e: unknown) => {
  if ((e as { code?: unknown }).code === "ENOENT") throw new NotFound(`ファイルが見つかりません: ${rel}`);
  throw e;
};

const lstatOrNull = (abs: string) => fs.lstat(abs).catch(() => null);

/** 区切り・「.」「..」・空の段は名前に使えない */
const badSegment = (part: string) => !part.trim() || part === "." || part === ".." || /[\\\0]/.test(part);

export function folderFiles(root: string, opts: FolderFilesOptions): FolderFiles {
  const realRoot = () => fs.realpath(root);
  const inside = async (rel: string) => {
    const top = await realRoot();
    const target = path.resolve(top, rel);
    if (path.isAbsolute(rel) || target === top || !isInside(top, target)) throw new Invalid(opts.outsideMessage);
    return target;
  };
  /** 作る・動かす・ゴミ箱へ入れる名前（ノートは「.」で始まる名前を断る） */
  const checkDots = (rel: string) => {
    if (opts.rejectDotNames && rel.split("/").some((part) => part.startsWith("."))) throw new Invalid("「.」で始まる名前は使えません");
  };
  /** 名前を確かめてから、中の絶対パスにする */
  const named = (rel: string) => {
    checkDots(rel);
    return inside(rel);
  };
  const resolve = async (rel: string) => {
    const real = await fs.realpath(await inside(rel)).catch(notFound(rel));
    await inside(path.relative(await realRoot(), real));
    return real;
  };
  /** いまある途中のフォルダが、リンクで外を指していないか（作ったものが外に出ないように） */
  const assertParentsInside = async (target: string) => {
    let existing = path.dirname(target);
    while (!(await lstatOrNull(existing))) existing = path.dirname(existing);
    if (!isInside(await realRoot(), await fs.realpath(existing))) throw new Invalid(opts.outsideMessage);
  };
  /** ファイルの実体（ファイルでなければ Invalid） */
  const fileOf = async (rel: string) => {
    const real = await resolve(rel);
    const stat = await fs.stat(real);
    if (!stat.isFile()) throw new Invalid("ファイルではありません");
    return { real, size: stat.size };
  };
  return {
    root,
    inside,
    resolve,
    exists: async (rel) => (await lstatOrNull(await inside(rel))) !== null,
    async read(rel) {
      const { real, size } = await fileOf(rel);
      const handle = await fs.open(real, "r");
      try {
        const buffer = Buffer.alloc(Math.min(size, MAX_FILE_BYTES));
        await handle.read(buffer, 0, buffer.length, 0);
        // 先頭に NUL があればバイナリとみなす（git と同じ考え方）
        const binary = buffer.subarray(0, 8000).includes(0);
        const truncated = size > MAX_FILE_BYTES;
        return { content: binary ? "" : buffer.toString("utf8"), hash: binary || truncated ? "" : hashOf(buffer), binary, truncated };
      } finally {
        await handle.close();
      }
    },
    async write(rel, content, baseHash) {
      const { real } = await fileOf(rel);
      // 開いたあとで、ほかで（エージェントなどが）変えていたら上書きしない（エージェントの作業を消さないため）
      if (baseHash !== null && hashOf(await fs.readFile(real)) !== baseHash) throw new Conflict("開いたあとで、ほかでファイルが変わりました");
      const data = Buffer.from(content, "utf8");
      await fs.writeFile(real, data);
      return { hash: hashOf(data) };
    },
    async create(rel, kind) {
      checkDots(rel);
      if (rel.split("/").some(badSegment)) throw new Invalid("その名前は使えません");
      const target = await inside(rel);
      if (await lstatOrNull(target)) throw new Conflict(`「${baseName(rel)}」はもうあります`);
      await assertParentsInside(target);
      await fs.mkdir(path.dirname(target), { recursive: true });
      if (kind.dir) await fs.mkdir(target);
      else await fs.writeFile(target, kind.content ?? "", { flag: "wx" });
    },
    async rename(rel, name) {
      const trimmed = name.trim();
      if (badSegment(trimmed) || trimmed.includes("/")) throw new Invalid("その名前は使えません");
      checkDots(trimmed);
      const from = await named(rel);
      await fs.lstat(from).catch(notFound(rel));
      const to = path.join(path.dirname(from), trimmed);
      if (to === from) return rel;
      // 大文字・小文字だけを変えるとき（macOS では同じファイルとみなされる）は、同じものがあるとは言わない
      if ((await lstatOrNull(to)) && to.toLowerCase() !== from.toLowerCase()) throw new Conflict(`「${trimmed}」はもうあります`);
      await fs.rename(from, to);
      return relativeApiPath(await realRoot(), to);
    },
    async move(from, to) {
      const source = await named(from);
      const target = await named(to);
      if (!(await lstatOrNull(source))) throw new NotFound(`ファイルが見つかりません: ${from}`);
      const top = await realRoot();
      const [fromRel, toRel] = [relativeApiPath(top, source), relativeApiPath(top, target)];
      if (toRel !== fromRel && isUnder(toRel, fromRel)) throw new Invalid("フォルダを、その中へは動かせません");
      // 大文字・小文字だけを変えるときは、同じファイルを指すので行き先があっても動かす
      if (source.toLowerCase() !== target.toLowerCase() && (await lstatOrNull(target))) throw new Conflict(`行き先に同じ名前の「${baseName(to)}」があります`);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(source, target);
    },
    async asset(rel) {
      // ページが読むもの（CSS・画像）なので、フォルダを指したときも「ない」にする
      const real = await resolve(rel);
      const stat = await fs.stat(real);
      if (!stat.isFile()) throw new NotFound(`ファイルが見つかりません: ${rel}`);
      if (stat.size > opts.maxAssetBytes) throw new Invalid(`ファイルが大きすぎます（上限 ${opts.maxAssetBytes / 1024 / 1024} MB）`);
      return fs.readFile(real);
    },
    async trash(rel, put) {
      const target = await named(rel);
      await fs.lstat(target).catch(notFound(rel));
      return put(target);
    },
  };
}
