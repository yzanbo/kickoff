import { createKernel } from "@/foundation/core/kernel";
import { serveCore } from "@/foundation/core/serve";
import { assembleCore } from "./assemble";
import { MIGRATIONS } from "./migrations";
import { ALL_SETTINGS } from "@/app/shared/settings";
import { prepareCore } from "./prepare";
import { realEnv } from "./realEnv";
import type { Core, CoreOptions } from "./types";

/** Kickoff のコア（DB・エージェント実行・HTTP API）を起動する: 土台を開く → 機能を組み立てる → 待ち受けて機能を始める。Electron にもヘッドレスにも依存しない */
export async function startCore(opts: CoreOptions): Promise<Core> {
  // 土台（保存先・Bus・DB）
  const k = createKernel({ dataDir: opts.dataDir, port: opts.port, host: opts.host, staticDir: opts.staticDir, platform: opts.platform, onChildProcess: opts.onChildProcess, migrations: MIGRATIONS, settings: ALL_SETTINGS });
  opts.onStage?.("dbOpened");
  const env = realEnv(opts);
  const assembled = assembleCore(k, env, await prepareCore(k, env));
  const served = await serveCore(k, assembled, { listen: { host: k.paths.host, port: k.paths.port } });
  opts.onStage?.("listening");
  const localUrl = `http://127.0.0.1:${k.paths.port}`;
  return {
    port: k.paths.port,
    token: served.token,
    localUrl,
    bus: k.bus,
    databaseStats: () => assembled.apis.chat.stats(),
    runningChats: assembled.runningChats,
    awakeNeeds: assembled.awakeNeeds,
    browserLoginUrl: () => `${localUrl}/login?code=${served.browserLogin.issue()}`,
    terminals: assembled.terminals,
    // 止める順（機能 → 流れ続けている外部コマンド → … → ためた途中の返答 → HTTP → DB）は serveCore が決める
    close: served.close,
  };
}
