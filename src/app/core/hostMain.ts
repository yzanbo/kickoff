// コアのプロセスの入口（Electron のメインプロセスが utilityProcess で起動する。ビルドで out/main/core.js。単体のコアは daemon.ts のまま）。
// 本体は run.ts の runCoreHost。モジュールは動的に読み、読み始める前と読み終えた時刻を起動の時刻の記録に入れる
// 読む前に、メインが起動の引数で渡した場所でコンパイルキャッシュを有効にする
import type { ParentPortLike } from "@/foundation/core/host/ports";
import { compileCacheDirOf, enableCompileCacheAt, flushCompileCache } from "@/foundation/core/system/compileCache";

const processStart = performance.timeOrigin;
const epochNow = () => performance.timeOrigin + performance.now();
const parentPort = (process as unknown as { parentPort?: ParentPortLike }).parentPort;

/** ready のあと、キャッシュを書き出すまで（起動の直後の画面の頼みと重ねない） */
const CACHE_FLUSH_AFTER_READY_MS = 10_000;

// utilityProcess の中でなければ起動しない（daemon・node で直接流したものと取り違えない）
if (!parentPort) {
  console.error("[core] Kickoff のコアのプロセスは、Kickoff のメインプロセスから起動します（単体で動かすときは npm run daemon）");
  process.exit(1);
} else {
  const cacheDir = compileCacheDirOf(process.argv);
  const cached = cacheDir ? enableCompileCacheAt(cacheDir) : false;
  const flush = () => {
    if (cached) flushCompileCache();
  };
  const [{ runCoreHost, coreStallWatch }, { startCore }, { macosPlatform }, { parentRpcPort }] = await Promise.all([
    import("./hostRun"),
    import("./startCore"),
    import("@/foundation/core/platform/macos/index"),
    import("@/foundation/core/host/ports"),
  ]);
  const modulesLoaded = epochNow();
  await runCoreHost(parentRpcPort(parentPort, { parentPid: () => process.ppid }), {
    startCore,
    // OS の口（いまは macOS だけ。ほかの OS を足すときは、ここと src/foundation/desktop/platform/index.ts で選び分ける）
    platform: (init) => macosPlatform({ speechHelper: init.speechHelper }),
    now: epochNow,
    // 終わる前にも書き出す（起動のあとに読んだモジュールの分）
    exit: (code) => {
      flush();
      process.exit(code);
    },
    timings: { processStart, modulesLoaded },
    onTerminate: (fn) => void process.once("SIGTERM", fn),
    watchStalls: coreStallWatch,
    onReady: () => void setTimeout(flush, CACHE_FLUSH_AFTER_READY_MS).unref(),
  });
}
