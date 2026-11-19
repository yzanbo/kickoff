import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import module from "node:module";
import path from "node:path";

// コアのプロセスのコンパイルキャッシュの置き場所と後片付け（メモの仕様書「0023_表示を軽くする」の案 24。分冊 4 の 5 章）。
// 置き場所は保存先の compile-cache/<アプリの版>-<Electron の版>-<arch>-<ビルドの印>/core。~/Library/Caches に置かないのは、
// AI の Bash の砂場がそこに書けるため（中身をすり替えると Kickoff のプロセスで自分のコードを動かせる）。保存先は砂場と自分を守る仕組みの両方で AI から触れない。
// メインプロセスの束には使わない（測って差が出なかった。分冊 4 の 5 章）

/** 保存先の下のキャッシュのフォルダ */
const COMPILE_CACHE_DIR = "compile-cache";

/** 起動して古い版のフォルダを消すまで */
const CLEAN_AFTER_MS = 30_000;

/** フォルダ名を組み立てる値 */
export interface CompileCacheParts {
  appVersion: string;
  electron: string;
  arch: string;
  /** ビルドの印（buildFingerprint） */
  buildId: string;
}

/**
 * ビルドの印: out/main/chunks の束の名前（中身のハッシュ付き）から作る。アプリの版は入れ替えても変わらず、Node はファイルの場所ごとに
 * キャッシュを持つので、版だけで分けると、入れ替えるたびに古い名前の束のキャッシュが同じフォルダにたまる。束の中身が変わらなければ
 * 同じ印になり、開発版で起動し直しても前のキャッシュを使える（名前のハッシュのない入口の束は、Node が中身のハッシュで外れを見分けて作り直す）
 */
export function buildFingerprint(chunkNames: readonly string[]): string {
  return createHash("sha1").update([...chunkNames].sort().join("\n")).digest("hex").slice(0, 12);
}

/** 名前に使えない文字（版の「-beta.1」の - も、区切りと取り違えないよう _ にする） */
const part = (s: string) => s.replace(/[^\w.]/g, "_") || "_";

/** キャッシュのフォルダ名（いまの版・ビルドだけが使う） */
export function compileCacheFolderName(p: CompileCacheParts): string {
  return [p.appVersion, p.electron, p.arch, p.buildId].map(part).join("-");
}

/** compileCacheFolderName の形 */
const FOLDER_PATTERN = /^[\w.]+-[\w.]+-\w+-\w+$/;

/** 消すフォルダ（いまのもの以外で、Kickoff が作った形の名前のものだけ。ほかの名前のものは触らない） */
export function staleCacheFolders(names: readonly string[], current: string): string[] {
  return names.filter((name) => name !== current && FOLDER_PATTERN.test(name));
}

/** ビルドの束の名前（読めなければ空 = 印は版だけで決まる） */
function chunkNames(chunksDir: string): string[] {
  try {
    return readdirSync(chunksDir);
  } catch {
    return [];
  }
}

/** コアのプロセスのキャッシュの場所を決め、起動して 30 秒たったら、ほかの版・ビルドのフォルダを裏で消す（起動のときに 1 回） */
export function prepareCoreCompileCache(opts: { userData: string; chunksDir: string; appVersion: string }): string {
  const root = path.join(opts.userData, COMPILE_CACHE_DIR);
  const folder = compileCacheFolderName({ appVersion: opts.appVersion, electron: process.versions.electron, arch: process.arch, buildId: buildFingerprint(chunkNames(opts.chunksDir)) });
  setTimeout(async () => {
    try {
      const names = await readdir(root);
      await Promise.all(staleCacheFolders(names, folder).map((name) => rm(path.join(root, name), { recursive: true, force: true })));
    } catch {
      // ない・消せないだけ（次の起動でまた試す）
    }
  }, CLEAN_AFTER_MS).unref();
  return path.join(root, folder, "core");
}

/** 環境変数で決めるキャッシュ（Node が起動の初めに読む） */
const CACHE_ENV = ["NODE_COMPILE_CACHE", "NODE_COMPILE_CACHE_PORTABLE"] as const;

/**
 * 環境変数 NODE_COMPILE_CACHE で起動されたなら、その場所を返し（起動の記録に残す）、環境変数を子のプロセス（コア・DB ワーカー・
 * ターミナル・エージェント）に受け継がせない。メインプロセスでは Node が起動の初めに読んで有効にしてしまい、Kickoff のコードでは止められない（分冊 4 の 5 章）
 */
export function dropCompileCacheEnv(): string | null {
  const dir = module.getCompileCacheDir() ?? null;
  for (const name of CACHE_ENV) delete process.env[name];
  return dir;
}
