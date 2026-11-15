// コアのプロセス（Electron の utilityProcess）の本体: init を待つ → OS の口 → ログインシェルの PATH を裏で読み始める → startCore → ready。
// メインとのやり取りは RPC（rpc.ts。形は protocol.ts）、親とのつなぎが切れたら片付けて終わる（残ったコアがポートを持ち続けると、
// 次の起動が「ポートが使われている」で失敗するため）。startCore・OS の口・時計・終わり方は引数で受ける（テストは偽のコアで手順だけを試す）。
// メモの仕様書「0023_表示を軽くする」の案 16（分冊 4 の 1-3）
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { errorMessage } from "@shared/errors";
import type { Core, CoreOptions } from "../index.js";
import type { HostPlatform } from "../platform/types.js";
import { waitForShellPath } from "../system/exec.js";
import { startProcessRecording } from "../system/processRecording.js";
import { startStallWatch, type StallRecord } from "../system/stallWatch.js";
import { rpcTimeoutOf, type AwakeNeeds, type CoreEvents, type CoreInit, type CoreMethods, type CoreToHost, type HostEvents, type HostMethods } from "./protocol.js";
import type { RpcPort } from "./ports.js";
import { createRpc } from "./rpc.js";
import { hostDbWorker, remoteBrowser, remoteCipher, remoteNotify } from "./remote.js";

export interface CoreHostDeps {
  startCore: (opts: CoreOptions) => Promise<Core>;
  /** OS の口を作る（音声認識の補助コマンドの場所は init から） */
  platform: (init: CoreInit) => HostPlatform;
  now: () => number;
  /** プロセスを終える（テストでは覚えるだけ） */
  exit: (code: number) => void;
  /** プロセスが始まった時刻・モジュールを読み終えた時刻（epoch ms） */
  timings: { processStart: number; modulesLoaded: number };
  /** SIGTERM を受ける（メインの child.kill() でも片付けてから終わる。テストでは渡さない） */
  onTerminate?: (fn: () => void) => void;
  /** 詰まりの見張りを始める（テストでは渡さない = 見張らない） */
  watchStalls?: (onStall: (record: StallRecord) => void) => () => void;
  /** ready を返したあとに 1 回（コンパイルキャッシュを書き出す。テストでは渡さない） */
  onReady?: () => void;
  /** 作業中の間、眠らせない理由を読み直す間隔（ms。既定 AWAKE_RECHECK_MS） */
  awakeRecheckMs?: number;
}

/**
 * 作業中の間、眠らせない理由を読み直す間隔。作業の終わりの知らせ（chat）は、実行の後片付け（作業中の数が減る）より先に流れるので、
 * 知らせのたびに読むだけでは、次に何か起きるまで「作業中」のまま残り、本体を眠らせなかった
 */
const AWAKE_RECHECK_MS = 2000;

/** 最初の init を待つ */
function nextInit(parent: RpcPort): Promise<CoreInit> {
  return new Promise((resolve) => {
    const off = parent.onMessage((m) => {
      const msg = m as { t?: unknown; init?: CoreInit };
      if (msg.t !== "init" || !msg.init) return;
      off();
      resolve(msg.init);
    });
  });
}

/** stalls.jsonl に書き足す（回すのはメインだけ。2 つのプロセスが同じ名前で回して消し合わないように） */
function appendStall(logsDir: string, record: StallRecord) {
  try {
    mkdirSync(logsDir, { recursive: true });
    appendFileSync(path.join(logsDir, "stalls.jsonl"), `${JSON.stringify(record)}\n`);
  } catch {
    // 記録が書けないだけ
  }
}

/** コアのプロセスを動かす（メインからの init で始め、ready / failed を返す） */
export async function runCoreHost(parent: RpcPort, deps: CoreHostDeps): Promise<void> {
  const init = await nextInit(parent);
  const post = (message: CoreToHost) => parent.post(message);
  const platform = deps.platform(init);
  // PATH: 前回の値を先に入れ、ログインシェルの読み直しは裏で始める（待つのは外部コマンドを起こす所だけ）
  waitForShellPath(platform.startShellPath(init.dataDir).ready);

  let core: Core | null = null;
  let closing: Promise<void> | null = null;
  let stopStalls = () => {};
  let awakeTimer: ReturnType<typeof setInterval> | null = null;
  let recording: Awaited<ReturnType<typeof startProcessRecording>> | null = null;
  const requireCore = () => {
    if (!core) throw new Error("Kickoff のコアはまだ準備中です");
    return core;
  };
  /** 片付けて終わる（何度呼ばれても 1 回だけ） */
  const closeAndExit = () =>
    (closing ??= (async () => {
      stopStalls();
      if (awakeTimer) clearInterval(awakeTimer);
      try {
        await core?.close();
      } catch (e) {
        console.error("[core] 片付けに失敗しました", e);
      }
      rpc.close("Kickoff のコアを閉じました");
      deps.exit(0);
    })());

  const rpc = createRpc<CoreMethods, HostMethods, CoreEvents, HostEvents>(parent, {
    timeoutOf: rpcTimeoutOf,
    handlers: {
      // 答えを返してから終わる（答えより先にプロセスが消えると、メインは close の失敗として待ち切ってしまう）
      close: async () => void setImmediate(() => void closeAndExit()),
      ping: async () => deps.now(),
      "diagnostics.start": async () => {
        const c = requireCore();
        recording = await startProcessRecording({ bus: c.bus, databaseStats: () => c.databaseStats() });
      },
      "diagnostics.stop": async () => {
        const stop = recording;
        recording = null;
        if (!stop) throw new Error("コアの記録を始めていません");
        const { summary, profile } = await stop();
        return { summary, profile: profile ?? null };
      },
      "terminal.closeOwnedBy": async (owner) => requireCore().terminals.closeOwnedBy(owner),
      metrics: async () => {
        const m = process.memoryUsage();
        return { heapUsedMB: Math.round(m.heapUsed / 1048576), rssMB: Math.round(m.rss / 1048576) };
      },
    },
  });

  const stages: { dbOpened?: number; listening?: number } = {};
  try {
    core = await deps.startCore({
      dataDir: init.dataDir,
      port: init.port,
      staticDir: init.staticDir ?? undefined,
      terminalEnv: init.terminalEnv,
      platform,
      hostPid: init.hostPid,
      recoveredReason: init.recoveredReason,
      browser: remoteBrowser(rpc),
      secretCipher: remoteCipher(rpc),
      notify: remoteNotify(rpc),
      dbWorker: hostDbWorker(rpc, parent),
      onChildProcess: (note) => rpc.emit("children", note),
      onStage: (stage) => (stages[stage] = deps.now()),
    });
  } catch (e) {
    // メインはいまと同じ「Kickoff を起動できません」を出して終える（作り直さない）
    post({ t: "failed", message: errorMessage(e) });
    rpc.close();
    deps.exit(1);
    return;
  }
  const started = core;

  // 眠らせない理由（作業中の数・スマホ連携）が変わったときだけメインへ（メインはバスを購読しない）。
  // 作業中の間は AWAKE_RECHECK_MS ごとにも読み直す（作業の終わりの知らせは、作業中の数が減るより先に流れるため）
  let lastAwake: AwakeNeeds | null = null;
  const reportAwake = () => {
    if (closing) return;
    const next = started.awakeNeeds();
    const running = next.running > 0;
    if (running && !awakeTimer) {
      awakeTimer = setInterval(reportAwake, deps.awakeRecheckMs ?? AWAKE_RECHECK_MS);
      awakeTimer.unref();
    } else if (!running && awakeTimer) {
      clearInterval(awakeTimer);
      awakeTimer = null;
    }
    if (lastAwake && lastAwake.running === next.running && lastAwake.mobileEnabled === next.mobileEnabled) return;
    lastAwake = next;
    rpc.emit("awake", next);
  };
  started.bus.subscribe((e) => {
    if (e.type === "chat" || e.type === "settings") reportAwake();
  });

  // コアのイベントループの詰まり（メインと同じ見張り。書き足すのはコア、最近の分はメインへも送って診断に入れる）
  if (deps.watchStalls) {
    stopStalls = deps.watchStalls((record) => {
      appendStall(init.logsDir, record);
      rpc.emit("stall", record);
    });
  }

  const now = deps.now();
  post({
    t: "ready",
    ready: {
      token: started.token,
      localUrl: started.localUrl,
      pid: process.pid,
      timings: { processStart: deps.timings.processStart, modulesLoaded: deps.timings.modulesLoaded, dbOpened: stages.dbOpened ?? now, listening: stages.listening ?? now },
    },
  });
  reportAwake();
  deps.onReady?.();
  deps.onTerminate?.(() => void closeAndExit());
  // メインが消えた（つなぎが切れた）ら、自分も片付けて終わる
  parent.onClose(() => void closeAndExit());
}

/** 本物の詰まりの見張り（コアのプロセスの分） */
export const coreStallWatch = (onStall: (record: StallRecord) => void) => startStallWatch({ process: "core", onStall });
