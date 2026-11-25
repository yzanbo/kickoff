import { StdioRpc, type StdioSpawn, type ServerRequestHandler } from "@/features/ai/core/providers/stdioRpc";
import { withTimeout } from "@shared/foundation/time";
import { CLIENT_INFO } from "@/features/ai/core/providers/shared/process";

export interface SessionOpts {
  spawn: StdioSpawn;
  args: string[];
  env: Record<string, string | undefined>;
  cwd: string;
  onProcessSpawned?: (pid: number) => void;
  onNotification?: (method: string, params: unknown) => void;
  onServerRequest?: ServerRequestHandler;
  onClosed?: (reason: string) => void;
}

/** 頼みを持たない用事（モデルの一覧・使用枠など）のサーバーからの頼みは、すべて断る */
const refuseAll: ServerRequestHandler = async (method) => {
  throw new Error(`Kickoff は ${method} に答えません`);
};

function startSession(opts: SessionOpts): StdioRpc {
  const proc = opts.spawn(opts.args, { env: opts.env, cwd: opts.cwd });
  if (proc.pid !== undefined) opts.onProcessSpawned?.(proc.pid);
  return new StdioRpc(proc, opts.onNotification ?? (() => {}), opts.onServerRequest ?? refuseAll, opts.onClosed, { label: "Codex の app-server", provider: "codex" });
}

async function initialize(rpc: StdioRpc): Promise<void> {
  // experimentalApi は AI からの質問（item/tool/requestUserInput）などを受けるため
  await rpc.request("initialize", { clientInfo: CLIENT_INFO, capabilities: { experimentalApi: true, requestAttestation: false } });
  rpc.notify("initialized");
}

/** app-server を起動して話し始める（initialize → initialized） */
export async function openSession(opts: SessionOpts): Promise<StdioRpc> {
  const rpc = startSession(opts);
  try {
    await initialize(rpc);
    return rpc;
  } catch (e) {
    rpc.close();
    throw e;
  }
}

/** 用事を 1 つ済ませるだけの短い会話（終わったら止める） */
export async function withSession<T>(opts: SessionOpts & { timeoutMs?: number }, fn: (rpc: StdioRpc) => Promise<T>): Promise<T> {
  const rpc = startSession(opts);
  try {
    const use = async () => {
      await initialize(rpc);
      return fn(rpc);
    };
    return await (opts.timeoutMs === undefined ? use() : withTimeout(use(), opts.timeoutMs, "Codex の app-server が時間内に応答しませんでした"));
  } finally {
    rpc.close();
  }
}
