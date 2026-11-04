import inspector from "node:inspector";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { errorMessage } from "@shared/errors";
import type { Core } from "../../core/index.js";
import { startCpuProfile, topSelfTime, type CpuProfile } from "./profileSummary.js";

// 性能の記録（diagnostics.ts）のうち、メインプロセス（コアの HTTP サーバー・DB・エージェントの実行も同じプロセス）の分。
// 画面が速くても、ここが詰まると SSE の知らせ・API の応答が遅れ、画面全体が遅く見える

let core: Core | undefined;

/** 記録で DB・知らせを数えるために、起動したコアを渡しておく */
export function setDiagnosticsCore(c: Core | undefined) {
  core = c;
}

/** イベントループの遅れを測る間隔（ms）。測った値にはこの間隔が含まれるので、差し引いて遅れた分だけにする */
const LOOP_RESOLUTION_MS = 10;

const mb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;

/** DB の大きさと、記録の多いチャット（集計はコアの databaseStats）。取れなければ理由 */
function dbStats() {
  if (!core) return null;
  try {
    return core.databaseStats();
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/**
 * メインプロセスの記録を始める（CPU プロファイル・イベントループの遅れ・コアが画面へ送った知らせの数と量）。
 * 返した関数で止めて、まとめと CPU プロファイルを返す
 */
export async function startMainRecording() {
  const loop = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS });
  loop.enable();
  const session = new inspector.Session();
  session.connect();
  const post = <T = unknown>(method: string, params: object = {}) =>
    new Promise<T>((resolve, reject) => session.post(method, params, (err, result) => (err ? reject(err) : resolve(result as T))));
  const stopProfile = await startCpuProfile(post);
  // 画面へ送った知らせ（SSE）の種類ごとの数と大きさ。大きな知らせが何度も届くと、画面でも受け取って描き直すのが重い
  const sent = new Map<string, { count: number; bytes: number }>();
  const unsubscribe = core?.bus.subscribe((e) => {
    const entry = sent.get(e.type) ?? { count: 0, bytes: 0 };
    entry.count++;
    entry.bytes += JSON.stringify(e).length;
    sent.set(e.type, entry);
  });
  const cpuBefore = process.cpuUsage();
  const startedAt = performance.now();

  return async () => {
    const elapsedMs = performance.now() - startedAt;
    const cpu = process.cpuUsage(cpuBefore);
    unsubscribe?.();
    loop.disable();
    let profile: CpuProfile | undefined;
    try {
      profile = await stopProfile();
    } finally {
      session.disconnect();
    }
    const memory = process.memoryUsage();
    const ms = (ns: number) => Math.max(0, Math.round((ns / 1e6 - LOOP_RESOLUTION_MS) * 10) / 10);
    const summary = {
      /** メインプロセスの CPU（記録した間の、1 秒あたりのミリ秒） */
      cpuMsPerSec: Math.round(((cpu.user + cpu.system) / 1000 / elapsedMs) * 1000),
      /** イベントループの遅れ（ms）。大きいと API・SSE の応答が遅れる */
      eventLoopDelayMs: { mean: ms(loop.mean), p99: ms(loop.percentile(99)), max: ms(loop.max) },
      memoryMB: { rss: mb(memory.rss), heapUsed: mb(memory.heapUsed), heapTotal: mb(memory.heapTotal), external: mb(memory.external) },
      /** 画面につないでいる SSE の数（開きっぱなしで増え続けていないか） */
      sseClients: core?.bus.listenerCount() ?? 0,
      sentEvents: [...sent.entries()]
        .map(([type, s]) => ({ type, count: s.count, kb: Math.round(s.bytes / 1024) }))
        .sort((a, b) => b.kb - a.kb),
      db: dbStats(),
      // 記録そのもの（プロファイルを止める inspector の呼び出し）は除く
      hotspots: profile ? topSelfTime(profile, 31).filter((h) => !h.where.startsWith("node:inspector")).slice(0, 30) : [],
    };
    return { summary, profile };
  };
}
