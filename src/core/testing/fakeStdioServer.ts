import type { StdioProcess, StdioSpawn } from "../providers/stdioRpc.js";

/**
 * 台本どおりに答える偽の JSON-RPC の CLI（テスト用。本物の CLI・アカウントは使わない）。Codex の app-server（fakeCodexServer）と
 * ACP のエージェント（fakeAcpAgent）で共有する。handle(method, fn) で頼みへの答えを決め、notify / request でサーバーからの知らせ・頼みを送る。
 * 届いた頼みは requests に残る
 */

type Handler = (params: any, server: FakeStdioServer) => unknown | Promise<unknown>;

interface FakeStdioServer {
  spawn: StdioSpawn;
  /** 起動した回（引数・環境変数・作業フォルダ） */
  spawned: { args: string[]; env: Record<string, string | undefined>; cwd: string }[];
  /** 届いた頼みと知らせ（method と params） */
  requests: { method: string; params: any }[];
  /** 送られてきた行（"jsonrpc" の欄があるかを見る） */
  lines: any[];
  /** 頼みへの答えを決める（投げたら JSON-RPC の失敗で答える） */
  handle(method: string, fn: Handler): void;
  /** サーバーからの知らせを送る（いちばん新しい起動へ） */
  notify(method: string, params: unknown): void;
  /** サーバーからの頼みを送り、答えを待つ */
  request(method: string, params: unknown): Promise<any>;
  /** 落ちたことにする */
  crash(code?: number): void;
  /** 止められたか（kill を呼ばれた回数） */
  killed: number;
  /** 頼み（method）が届くまで待つ */
  waitFor(method: string): Promise<any>;
}

/** 偽の CLI を作る（defaults: はじめから答える頼み） */
export function fakeStdioServer(defaults: [string, Handler][] = []): FakeStdioServer {
  const handlers = new Map<string, Handler>(defaults);
  const waiters: { method: string; resolve: (p: any) => void }[] = [];
  let lineListener: ((line: string) => void) | null = null;
  let exitListener: ((code: number | null, tail: string) => void) | null = null;
  let nextId = 1000;
  const pending = new Map<number, (value: any) => void>();

  const send = (msg: unknown) => setImmediate(() => lineListener?.(JSON.stringify(msg)));

  const server: FakeStdioServer = {
    spawned: [],
    requests: [],
    lines: [],
    killed: 0,
    handle: (method, fn) => handlers.set(method, fn),
    notify: (method, params) => send({ method, params }),
    request: (method, params) => {
      const id = nextId++;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        send({ id, method, params });
      });
    },
    crash: (code = 1) => setImmediate(() => exitListener?.(code, "fake crash")),
    waitFor: (method) => {
      const found = server.requests.find((r) => r.method === method);
      if (found) return Promise.resolve(found.params);
      return new Promise((resolve) => waiters.push({ method, resolve }));
    },
    spawn: (args, opts) => {
      server.spawned.push({ args, env: opts.env, cwd: opts.cwd });
      const proc: StdioProcess = {
        write: (line) => {
          const msg = JSON.parse(line) as { id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown };
          server.lines.push(msg);
          if (msg.method === undefined && msg.id !== undefined) {
            pending.get(msg.id)?.(msg.error ? { error: msg.error } : msg.result);
            pending.delete(msg.id);
            return;
          }
          if (msg.method === undefined) return;
          server.requests.push({ method: msg.method, params: msg.params });
          for (const w of waiters.filter((x) => x.method === msg.method)) {
            waiters.splice(waiters.indexOf(w), 1);
            w.resolve(msg.params);
          }
          if (msg.id === undefined) return;
          const id = msg.id;
          const handler = handlers.get(msg.method);
          Promise.resolve()
            .then(() => (handler ? handler(msg.params, server) : Promise.reject(new Error(`unknown method ${msg.method}`))))
            .then(
              (result) => send({ id, result: result ?? {} }),
              (e: Error & { code?: number }) => send({ id, error: { code: e.code ?? -32601, message: e.message } }),
            );
        },
        onLine: (listener) => {
          lineListener = listener;
        },
        onExit: (listener) => {
          exitListener = listener;
        },
        kill: () => {
          server.killed++;
        },
      };
      return proc;
    },
  };
  return server;
}

/** 偽の Codex の app-server（はじめから答える頼み: initialize・スレッド・ターン） */
export type FakeCodexServer = FakeStdioServer;
export function fakeCodexServer(): FakeCodexServer {
  // スレッドごとの config の上書き（hooks/list が、渡されたフックと信頼の覚えから答える。本物は信頼の覚えがなければ untrusted）
  const configs = new Map<string, Record<string, any>>();
  const remember = (id: string, p: { config?: Record<string, any> | null }) => configs.set(id, p.config ?? {});
  return fakeStdioServer([
    ["initialize", () => ({ userAgent: "fake" })],
    [
      "thread/start",
      (p) => {
        const id = p.ephemeral ? "thr-probe" : "thr-1";
        remember(id, p);
        return { thread: { id }, model: "gpt-fake" };
      },
    ],
    [
      "thread/resume",
      (p) => {
        remember(p.threadId, p);
        return { thread: { id: p.threadId }, model: "gpt-fake" };
      },
    ],
    [
      "hooks/list",
      (p) => {
        const config = configs.get(p.threadId) ?? {};
        const key = "/<session-flags>/config.toml:pre_tool_use:0:0";
        const hooks = (config["hooks.PreToolUse"] ?? []).flatMap((group: any) =>
          group.hooks.map((h: any) => ({
            key,
            eventName: "preToolUse",
            source: "sessionFlags",
            command: h.command,
            currentHash: "sha256:fake",
            enabled: true,
            trustStatus: config["hooks.state"]?.[key]?.trusted_hash === "sha256:fake" ? "trusted" : "untrusted",
          })),
        );
        return { data: [{ cwd: "/w", hooks, warnings: [], errors: [] }] };
      },
    ],
    ["turn/start", () => ({ turn: { id: "turn-1", status: "inProgress", error: null } })],
    ["turn/steer", () => ({})],
    ["turn/interrupt", () => ({})],
  ]);
}

/** 偽の ACP のエージェント（はじめから答える頼み: initialize・authenticate・セッション・指示。capabilities は初期化の答えの agentCapabilities） */
export type FakeAcpAgent = FakeStdioServer;
export function fakeAcpAgent(capabilities: Record<string, unknown> = {}, authMethods: { id: string; name: string }[] = []): FakeAcpAgent {
  const session = (id: string) => ({ sessionId: id, modes: { currentModeId: "auto", availableModes: [{ id: "default", name: "Default" }, { id: "plan", name: "Plan" }, { id: "auto", name: "Auto" }] } });
  return fakeStdioServer([
    ["initialize", () => ({ protocolVersion: 1, agentCapabilities: capabilities, authMethods })],
    ["authenticate", () => ({})],
    ["session/new", () => session("ses-1")],
    ["session/resume", (p) => session(p.sessionId)],
    ["session/load", (p) => session(p.sessionId)],
    ["session/set_mode", () => ({})],
    ["session/set_config_option", () => ({ configOptions: [] })],
    ["session/prompt", () => ({ stopReason: "end_turn" })],
  ]);
}
