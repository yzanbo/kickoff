import type { CodexProcess, CodexSpawn } from "../providers/codex/rpc.js";

/**
 * 台本どおりに答える偽の Codex の app-server（テスト用。本物の codex・アカウントは使わない）。
 * handle(method, fn) で頼みへの答えを決め、notify / request でサーバーからの知らせ・頼みを送る。届いた頼みは requests に残る
 */

type Handler = (params: any, server: FakeCodexServer) => unknown | Promise<unknown>;

export interface FakeCodexServer {
  spawn: CodexSpawn;
  /** 起動した回（引数・環境変数・作業フォルダ） */
  spawned: { args: string[]; env: Record<string, string | undefined>; cwd: string }[];
  /** 届いた頼みと知らせ（method と params） */
  requests: { method: string; params: any }[];
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

export function fakeCodexServer(): FakeCodexServer {
  const handlers = new Map<string, Handler>([
    ["initialize", () => ({ userAgent: "fake" })],
    ["thread/start", () => ({ thread: { id: "thr-1" }, model: "gpt-fake" })],
    ["thread/resume", (p) => ({ thread: { id: p.threadId }, model: "gpt-fake" })],
    ["turn/start", () => ({ turn: { id: "turn-1", status: "inProgress", error: null } })],
    ["turn/steer", () => ({})],
    ["turn/interrupt", () => ({})],
  ]);
  const waiters: { method: string; resolve: (p: any) => void }[] = [];
  let lineListener: ((line: string) => void) | null = null;
  let exitListener: ((code: number | null, tail: string) => void) | null = null;
  let nextId = 1000;
  const pending = new Map<number, (value: any) => void>();

  const send = (msg: unknown) => setImmediate(() => lineListener?.(JSON.stringify(msg)));

  const server: FakeCodexServer = {
    spawned: [],
    requests: [],
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
      const proc: CodexProcess = {
        write: (line) => {
          const msg = JSON.parse(line) as { id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown };
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
              (e: Error) => send({ id, error: { code: -32601, message: e.message } }),
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
