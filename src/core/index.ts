import fs from "node:fs";
import path from "node:path";
import { loadOrCreateToken } from "./auth.js";
import { Bus } from "./bus.js";
import { startHttpServer, stopHttpServer } from "./httpServer.js";
import { createProviders } from "./providers/index.js";
import { currentSelf } from "./selfProtection.js";
import { createApp } from "./server.js";
import { Store } from "./store.js";
import { ServiceUsageMonitor } from "./serviceUsage/index.js";
import { UsageMonitor } from "./usage.js";
import { ApprovalCenter } from "./approvals.js";
import { Runner } from "./runner.js";
import { UploadStore } from "./uploads.js";
import { startAutoArchive } from "./autoArchive.js";

export interface CoreOptions {
  dataDir: string;
  port: number;
  /** 127.0.0.1 なら Mac 内からのみ、0.0.0.0 なら LAN にも公開 */
  host?: string;
  staticDir?: string;
}

export interface Core {
  port: number;
  token: string;
  localUrl: string;
  store: Store;
  bus: Bus;
  approvals: ApprovalCenter;
  close(): Promise<void>;
}

/** Kickoff のコア（DB・エージェント実行・HTTP API）を起動する。Electron にもヘッドレスにも依存しない */
export async function startCore(opts: CoreOptions): Promise<Core> {
  fs.mkdirSync(opts.dataDir, { recursive: true });
  const bus = new Bus();
  const store = new Store(path.join(opts.dataDir, "kickoff.db"), (e) => bus.publish(e));
  const recovered = store.recoverInterruptedRuns();
  if (recovered > 0) console.log(`[core] 中断された実行を ${recovered} 件復旧しました`);

  const token = loadOrCreateToken(opts.dataDir);
  // エージェントが自分（このプロセス・保存先・API）を壊さないよう、自分の情報を渡す
  const providers = createProviders(currentSelf(opts.dataDir, opts.port));
  // 使用枠は Claude のプランから取得する（Codex 対応時にプロバイダーごとに拡張する）
  const usage = new UsageMonitor(providers.claude, bus);
  // 設定の「使用状況」に並べる、ほかのサービス（Codex・Copilot・Cursor・Gemini）の使用状況
  const serviceUsage = new ServiceUsageMonitor(usage);
  const approvals = new ApprovalCenter(bus);
  const uploads = new UploadStore(path.join(opts.dataDir, "uploads"));
  const runner = new Runner({ store, approvals, providers, usage, uploads, bus });
  const host = opts.host ?? "127.0.0.1";
  const app = createApp({
    store,
    bus,
    token,
    providers,
    usage,
    serviceUsage,
    runner,
    approvals,
    uploads,
    staticDir: opts.staticDir,
    listen: { host, port: opts.port },
  });

  // ポートが使われているなどで待ち受けられなければ、開いた DB を閉じてから伝える
  const server = await startHttpServer(app, { port: opts.port, host }).catch((e: unknown) => {
    store.close();
    throw e;
  });
  usage.start();
  // 完了したチャットの自動のアーカイブ（設定でオンにしたときだけ）
  const stopAutoArchive = startAutoArchive(store, bus);

  return {
    port: opts.port,
    token,
    localUrl: `http://127.0.0.1:${opts.port}`,
    store,
    bus,
    approvals,
    close: async () => {
      runner.shutdown();
      usage.stop();
      stopAutoArchive();
      await stopHttpServer(server);
      store.close();
    },
  };
}
