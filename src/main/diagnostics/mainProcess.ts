import fs from "node:fs";
import inspector from "node:inspector";
import path from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Core } from "../../core/index.js";
import { topSelfTime, type CpuProfile } from "./profileSummary.js";

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

/** DB の大きさと、記録の多いチャット（長く続けたチャットほど、開く・描くのが重くなる） */
function dbStats(dataDir: string) {
  const size = (name: string) => {
    try {
      return mb(fs.statSync(path.join(dataDir, name)).size);
    } catch {
      return 0;
    }
  };
  const files = { dbMB: size("kickoff.db"), walMB: size("kickoff.db-wal") };
  if (!core) return files;
  try {
    const db = core.store.db;
    const count = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n);
    const busiest = db
      .prepare(
        "SELECT e.chat_id AS id, COUNT(*) AS events, r.title AS title, r.status AS status FROM chat_events e JOIN chats r ON r.id = e.chat_id GROUP BY e.chat_id ORDER BY events DESC LIMIT 5",
      )
      .all() as { id: number; events: number; title: string | null; status: string }[];
    return { ...files, chats: count("SELECT COUNT(*) AS n FROM chats"), events: count("SELECT COUNT(*) AS n FROM chat_events"), busiestChats: busiest };
  } catch (e) {
    return { ...files, error: String(e) };
  }
}

/**
 * メインプロセスの記録を始める（CPU プロファイル・イベントループの遅れ・コアが画面へ送った知らせの数と量）。
 * 返した関数で止めて、まとめと CPU プロファイルを返す
 */
export async function startMainRecording(dataDir: string) {
  const loop = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS });
  loop.enable();
  const session = new inspector.Session();
  session.connect();
  const post = <T = unknown>(method: string, params: object = {}) =>
    new Promise<T>((resolve, reject) => session.post(method, params, (err, result) => (err ? reject(err) : resolve(result as T))));
  await post("Profiler.enable");
  await post("Profiler.setSamplingInterval", { interval: 1000 });
  await post("Profiler.start");
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
      profile = (await post<{ profile: CpuProfile }>("Profiler.stop")).profile;
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
      db: dbStats(dataDir),
      // 記録そのもの（プロファイルを止める inspector の呼び出し）は除く
      hotspots: profile ? topSelfTime(profile, 31).filter((h) => !h.where.startsWith("node:inspector")).slice(0, 30) : [],
    };
    return { summary, profile };
  };
}
