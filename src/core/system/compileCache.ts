import module from "node:module";

// V8 のコンパイルキャッシュ（Node の module.enableCompileCache）を、Kickoff が決めた場所で使う（メモの仕様書「0023_表示を軽くする」の案 24）。
// コアのプロセスの入口（src/core/host/main.ts）が、本体を読み込む前に呼ぶ（呼んだあとに読むモジュールだけが載る）。場所はメインプロセスが決める
// （src/main/app/compileCache.ts）。このファイルは入口が先に読むので、ほかのモジュールに依らない（ここで読んだものはキャッシュに載らない）

/** メインがコアのプロセスに、キャッシュの場所を渡す引数（init は本体を読み込んだあとに届くので、起動の引数で渡す） */
export const COMPILE_CACHE_ARG = "--kickoff-compile-cache=";

/** 起動の引数からキャッシュの場所を読む（なければ null） */
export function compileCacheDirOf(argv: readonly string[]): string | null {
  const arg = argv.find((a) => a.startsWith(COMPILE_CACHE_ARG));
  const dir = arg?.slice(COMPILE_CACHE_ARG.length);
  return dir ? dir : null;
}

/**
 * dir でコンパイルキャッシュを有効にする（有効にできたら true）。環境変数 NODE_COMPILE_CACHE で起動されていれば、Node が起動の初めに
 * その場所で有効にしていて変えられない（ALREADY_ENABLED）ので false（メインはコアに環境変数を渡さない）
 */
export function enableCompileCacheAt(dir: string): boolean {
  try {
    return module.enableCompileCache(dir).status === module.constants.compileCacheStatus.ENABLED;
  } catch {
    // キャッシュが使えなくても起動は続ける（遅くなるだけ）
    return false;
  }
}

/** たまったキャッシュを書き出す（プロセスが普通に終わらないと書かれないため） */
export function flushCompileCache() {
  try {
    module.flushCompileCache();
  } catch {
    // 書けなくても次の起動で作り直すだけ
  }
}
