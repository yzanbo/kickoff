import fs from "node:fs";
import path from "node:path";
import { serve, type ServerType } from "@hono/node-server";
import { loadOrCreateToken } from "./auth.js";
import { Bus } from "./bus.js";
import { createProviders } from "./providers/index.js";
import { createApp } from "./server.js";
import { Store } from "./store.js";

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
  const providers = createProviders();
  const app = createApp({ store, bus, token, providers, staticDir: opts.staticDir });

  const host = opts.host ?? "127.0.0.1";
  const server = await new Promise<ServerType>((resolve, reject) => {
    const s = serve({ fetch: app.fetch, port: opts.port, hostname: host }, () => resolve(s));
    s.once("error", reject);
  });

  return {
    port: opts.port,
    token,
    localUrl: `http://127.0.0.1:${opts.port}`,
    store,
    bus,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          store.close();
          resolve();
        });
      }),
  };
}
