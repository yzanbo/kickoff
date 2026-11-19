import { createKernel } from "@/foundation/core/kernel";
import { serveCore } from "@/foundation/core/serve";
import { assembleCore } from "./assemble";
import type { Core, CoreOptions } from "./types";

/** Kickoff のコア（DB・エージェント実行・HTTP API）を起動する: 土台を開く → 機能を組み立てる → 待ち受けて機能を始める。Electron にもヘッドレスにも依存しない */
export async function startCore(opts: CoreOptions): Promise<Core> {
  // 土台（保存先・Bus・DB）。店の束は機能へ分けるまで Kernel から受ける
  const k = createKernel({ dataDir: opts.dataDir, port: opts.port, host: opts.host, staticDir: opts.staticDir, platform: opts.platform, onChildProcess: opts.onChildProcess });
  opts.onStage?.("dbOpened");
  const assembled = await assembleCore(k, opts);
  const served = await serveCore(k, assembled, { listen: { host: k.paths.host, port: k.paths.port } });
  opts.onStage?.("listening");
  const localUrl = `http://127.0.0.1:${k.paths.port}`;
  return {
    port: k.paths.port,
    token: served.token,
    localUrl,
    bus: k.bus,
    databaseStats: () => k.store.stats(),
    runningChats: assembled.runningChats,
    awakeNeeds: assembled.awakeNeeds,
    browserLoginUrl: () => `${localUrl}/login?code=${served.browserLogin.issue()}`,
    terminals: assembled.terminals,
    // 止める順（機能 → 流れ続けている外部コマンド → … → ためた途中の返答 → HTTP → DB）は serveCore が決める
    close: served.close,
  };
}
