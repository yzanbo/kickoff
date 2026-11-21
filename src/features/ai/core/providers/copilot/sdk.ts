import { noteRuntimeProcess } from "./runtimeProcess";
import type { CopilotSession, GetAuthStatusResponse, MCPServerConfig, ModelInfo, PermissionRequest, PermissionRequestResult, ProviderConfig, ResumeSessionConfig, SandboxConfig, SessionConfig, SessionEvent } from "@github/copilot-sdk";
import { CLIENT_INFO } from "@/features/ai/core/providers/shared/process";

/**
 * Copilot SDK（@github/copilot-sdk）のうち Kickoff が使う所だけの口。テストは偽物に差し替える（testing/fakeCopilotClient.ts）。
 * Copilot は ACP（プレビュー）でなく、この公式の SDK で動かす（SDK が同梱のランタイムを起こすので、copilot CLI を別に入れなくてよい）。
 * SDK の本体は使うときにだけ読み込む（読み込むと Copilot のランタイムの準備まで走るので、コアの起動を遅くしない）
 */

export type { SessionConfig, ResumeSessionConfig, SessionEvent, ModelInfo, MCPServerConfig, ProviderConfig, SandboxConfig, PermissionRequest, PermissionRequestResult };

/** 使うセッションの操作 */
export interface CopilotSessionLike {
  readonly sessionId: string;
  on(handler: (event: SessionEvent) => void): () => void;
  send(options: { prompt: string; mode?: "enqueue" | "immediate" }): Promise<string>;
  abort(): Promise<void>;
  disconnect(): Promise<void>;
  /** 会話の記録（分岐の境目を探す） */
  getEvents(): Promise<{ id: string; type: string }[]>;
  /** 手で頼む圧縮（session.rpc.history.compact） */
  compact(): Promise<{ success: boolean; tokensRemoved: number }>;
}

/** 使用枠の 1 つ（account.getQuota の quotaSnapshots の値） */
export interface CopilotQuotaSnapshot {
  isUnlimitedEntitlement: boolean;
  entitlementRequests: number;
  usedRequests: number;
  remainingPercentage: number;
  resetDate?: string;
}

/** 使うクライアント（1 回の用事・1 回の実行ごとに 1 つのランタイムを起こして止める） */
export interface CopilotClientLike {
  start(): Promise<void>;
  stop(): Promise<unknown>;
  createSession(config: SessionConfig): Promise<CopilotSessionLike>;
  resumeSession(sessionId: string, config: ResumeSessionConfig): Promise<CopilotSessionLike>;
  getAuthStatus(): Promise<GetAuthStatusResponse>;
  listModels(): Promise<ModelInfo[]>;
  /** 使用枠（account.getQuota。実験的） */
  getQuota(): Promise<Record<string, CopilotQuotaSnapshot | undefined>>;
  /** 会話を分ける（sessions.fork。toEventId の手前まで） */
  forkSession(sessionId: string, toEventId: string | undefined): Promise<string>;
}

/** クライアントの作り方（env = ランタイムの環境変数・cwd = ランタイムの作業フォルダ） */
export type CopilotClientFactory = (opts: { env: Record<string, string | undefined>; cwd: string }) => CopilotClientLike;

/** SDK のセッションを口の形にする */
function wrapSession(session: CopilotSession): CopilotSessionLike {
  return {
    get sessionId() {
      return session.sessionId;
    },
    on: (handler) => session.on(handler),
    send: (options) => session.send(options),
    abort: () => session.abort(),
    disconnect: () => session.disconnect(),
    getEvents: async () => (await session.getEvents()).map((e) => ({ id: e.id, type: e.type })),
    compact: async () => {
      const res = await session.rpc.history.compact({ trigger: "manual" });
      return { success: res.success, tokensRemoved: res.tokensRemoved };
    },
  };
}

/**
 * 本物の SDK のクライアント。ランタイムは SDK に同梱のもの（@github/copilot-sdk-<OS>-<CPU>）を stdio で起こし、ログインは Copilot の
 * ログインのまま（useLoggedInUser）。環境変数はランタイムの子（AI のコマンド）にも引き継がれる
 */
export const sdkClientFactory: CopilotClientFactory = ({ env, cwd }) => {
  let client: import("@github/copilot-sdk").CopilotClient | null = null;
  const ready = async () => {
    if (client) return client;
    const sdk = await import("@github/copilot-sdk");
    client = new sdk.CopilotClient({ env, workingDirectory: cwd, useLoggedInUser: true, logLevel: "error", clientInfo: { applicationName: CLIENT_INFO.title, applicationVersion: CLIENT_INFO.version } });
    return client;
  };
  return {
    start: async () => {
      const c = await ready();
      await c.start();
      // ランタイムの子をメインに知らせる（コアが落ちたら作り直す前に止める）
      noteRuntimeProcess(c);
    },
    stop: async () => (client ? client.stop() : []),
    createSession: async (config) => wrapSession(await (await ready()).createSession(config)),
    resumeSession: async (id, config) => wrapSession(await (await ready()).resumeSession(id, config)),
    getAuthStatus: async () => (await ready()).getAuthStatus(),
    listModels: async () => (await ready()).listModels(),
    getQuota: async () => (await (await ready()).rpc.account.getQuota({})).quotaSnapshots,
    forkSession: async (sessionId, toEventId) => (await (await ready()).rpc.sessions.fork({ sessionId, ...(toEventId ? { toEventId } : {}) })).sessionId,
  };
};
