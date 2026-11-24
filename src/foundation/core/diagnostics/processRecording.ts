import inspector from "node:inspector";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { errorMessage } from "@shared/foundation/errors";
import type { Bus } from "@/foundation/core/bus";
import { sseDataOf } from "@/foundation/core/http/sseData";
import { startCpuProfile, topSelfTime, type CpuProfile } from "@/foundation/core/system/cpuProfile";

// 性能の記録（メインプロセスの diagnostics.ts が 10 秒取る）のうち、Node のプロセスの分。メインプロセスとコアのプロセス
// （HTTP サーバー・DB・エージェントの実行）がそれぞれ自分の中で取る（inspector の CPU プロファイルは、そのプロセスの中でしか取れない）。
// コアの分には、画面へ送った知らせの数と量・SSE の数・DB の様子も入れる。画面が速くても、コアが詰まると SSE の知らせ・API の応答が遅れる

/** コアの分だけ: 送った知らせを数えるバスと、DB の様子（中身はそのまま summary の db に入れる） */
interface CoreParts {
  bus: Bus;
  databaseStats: () => unknown;
}

/** イベントループの遅れを測る間隔（ms）。測った値にはこの間隔が含まれるので、差し引いて遅れた分だけにする */
const LOOP_RESOLUTION_MS = 10;

const mb = (bytes: number) => Math.round((bytes / 1048576) * 10) / 10;

/** DB の大きさと、記録の多いチャット（集計はコアの databaseStats）。取れなければ理由 */
function dbStats(core: CoreParts | undefined) {
  if (!core) return null;
  try {
    return core.databaseStats();
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/**
 * このプロセスの記録を始める（CPU プロファイル・イベントループの遅れ。コアなら画面へ送った知らせの数と量・DB の様子も）。
 * 返した関数で止めて、まとめと CPU プロファイルを返す
 */
export async function startProcessRecording(core?: CoreParts) {
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
    // SSE で送る文と同じもの（同じ知らせを 2 度文字にしない）
    entry.bytes += sseDataOf(e).length;
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
      /** このプロセスの CPU（記録した間の、1 秒あたりのミリ秒） */
      cpuMsPerSec: Math.round(((cpu.user + cpu.system) / 1000 / elapsedMs) * 1000),
      /** イベントループの遅れ（ms）。大きいと API・SSE の応答が遅れる */
      eventLoopDelayMs: { mean: ms(loop.mean), p99: ms(loop.percentile(99)), max: ms(loop.max) },
      memoryMB: { rss: mb(memory.rss), heapUsed: mb(memory.heapUsed), heapTotal: mb(memory.heapTotal), external: mb(memory.external) },
      /** 画面につないでいる SSE の数（開きっぱなしで増え続けていないか） */
      sseClients: core?.bus.listenerCount() ?? 0,
      sentEvents: [...sent.entries()]
        .map(([type, s]) => ({ type, count: s.count, kb: Math.round(s.bytes / 1024) }))
        .sort((a, b) => b.kb - a.kb),
      db: dbStats(core),
      // 記録そのもの（プロファイルを止める inspector の呼び出し）は除く
      hotspots: profile ? topSelfTime(profile, 31).filter((h) => !h.where.startsWith("node:inspector")).slice(0, 30) : [],
    };
    return { summary, profile };
  };
}
