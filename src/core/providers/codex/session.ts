import { StdioRpc, type StdioSpawn, type ServerRequestHandler } from "../stdioRpc.js";

/** Kickoff の名乗り（initialize の clientInfo） */
const CLIENT_INFO = { name: "kickoff", title: "Kickoff", version: "0.1.0" };

export interface SessionOpts {
  spawn: StdioSpawn;
  args: string[];
  env: Record<string, string | undefined>;
  cwd: string;
  onNotification?: (method: string, params: unknown) => void;
  onServerRequest?: ServerRequestHandler;
  onClosed?: (reason: string) => void;
}

/** 頼みを持たない用事（モデルの一覧・使用枠など）のサーバーからの頼みは、すべて断る */
const refuseAll: ServerRequestHandler = async (method) => {
  throw new Error(`Kickoff は ${method} に答えません`);
};

/**
 * app-server を起動して話し始める（initialize → initialized）。
 * experimentalApi は AI からの質問（item/tool/requestUserInput）などを受けるため
 */
export async function openSession(opts: SessionOpts): Promise<StdioRpc> {
  const proc = opts.spawn(opts.args, { env: opts.env, cwd: opts.cwd });
  const rpc = new StdioRpc(proc, opts.onNotification ?? (() => {}), opts.onServerRequest ?? refuseAll, opts.onClosed, { label: "Codex の app-server", provider: "codex" });
  try {
    await rpc.request("initialize", { clientInfo: CLIENT_INFO, capabilities: { experimentalApi: true, requestAttestation: false } });
    rpc.notify("initialized");
    return rpc;
  } catch (e) {
    rpc.close();
    throw e;
  }
}

/** 用事を 1 つ済ませるだけの短い会話（終わったら止める） */
export async function withSession<T>(opts: SessionOpts, fn: (rpc: StdioRpc) => Promise<T>): Promise<T> {
  const rpc = await openSession(opts);
  try {
    return await fn(rpc);
  } finally {
    rpc.close();
  }
}
