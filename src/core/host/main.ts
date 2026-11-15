// コアのプロセスの入口（Electron のメインプロセスが utilityProcess で起動する。ビルドで out/main/core.js。単体のコアは daemon.ts のまま）。
// 本体は run.ts の runCoreHost。モジュールは動的に読み、読み始める前と読み終えた時刻を起動の時刻の記録に入れる
// （メモの仕様書「0023_表示を軽くする」の案 16・18c）
import type { ParentPortLike } from "./ports.js";

const processStart = performance.timeOrigin;
const epochNow = () => performance.timeOrigin + performance.now();
const parentPort = (process as unknown as { parentPort?: ParentPortLike }).parentPort;

// utilityProcess の中でなければ起動しない（daemon・node で直接流したものと取り違えない）
if (!parentPort) {
  console.error("[core] Kickoff のコアのプロセスは、Kickoff のメインプロセスから起動します（単体で動かすときは npm run daemon）");
  process.exit(1);
} else {
  const [{ runCoreHost, coreStallWatch }, { startCore }, { macosPlatform }, { parentRpcPort }] = await Promise.all([
    import("./run.js"),
    import("../index.js"),
    import("../platform/macos/index.js"),
    import("./ports.js"),
  ]);
  const modulesLoaded = epochNow();
  await runCoreHost(parentRpcPort(parentPort, { parentPid: () => process.ppid }), {
    startCore,
    // OS の口（いまは macOS だけ。ほかの OS を足すときは、ここと src/main/platform/index.ts で選び分ける）
    platform: (init) => macosPlatform({ speechHelper: init.speechHelper }),
    now: epochNow,
    exit: (code) => process.exit(code),
    timings: { processStart, modulesLoaded },
    onTerminate: (fn) => void process.once("SIGTERM", fn),
    watchStalls: coreStallWatch,
  });
}
