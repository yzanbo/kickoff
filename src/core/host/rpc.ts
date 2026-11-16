// 呼ぶ・答える・知らせるの小さな RPC（メインとコアのプロセスの間。protocol.ts の RpcMessage を 1 本の口で運ぶ）。
// 番号付きの呼び出し・時間の上限・口が閉じたら待っている呼び出しを失敗にする。失敗は文で運び、受けた側で Error にする
// （埋め込みブラウザの操作の失敗は「理由の文の Error」なので、AI に返る文は変わらない）
import { errorMessage } from "@shared/errors";
import type { RpcMessage } from "./protocol.js";
import type { RpcPort } from "./ports.js";

// 表の型（CoreMethods など）を受けるため、関数の形だけを any で受ける（引数の形は表ごとに違う）
type AnyFn = (...args: any[]) => Promise<unknown>;
type Fns<T> = { [K in keyof T]: T[K] extends AnyFn ? T[K] : never };

/** 時計（テストでは手で進めるものを渡す） */
export interface RpcTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: RpcTimers = {
  set: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  },
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface Rpc<Remote, LocalEvents, RemoteEvents> {
  /** 相手の口を呼ぶ（失敗・時間切れ・口が閉じたら Error） */
  call<M extends keyof Remote & string>(method: M, ...args: Parameters<Fns<Remote>[M]>): ReturnType<Fns<Remote>[M]>;
  /** 返事のない知らせを送る（口が閉じていれば捨てる） */
  emit<E extends keyof LocalEvents & string>(name: E, payload: LocalEvents[E]): void;
  /** 相手からの知らせを受ける（やめる関数を返す） */
  on<E extends keyof RemoteEvents & string>(name: E, fn: (payload: RemoteEvents[E]) => void): () => void;
  /** 口を閉じたことにする（待っている呼び出しを reason で失敗にし、以後は送らない） */
  close(reason?: string): void;
}

/** RpcMessage か（ほかの形 = init・ready・port などは持ち主が受ける） */
export function isRpcMessage(m: unknown): m is RpcMessage {
  if (typeof m !== "object" || m === null) return false;
  const t = (m as { t?: unknown }).t;
  return t === "call" || t === "result" || t === "event";
}

/** 口が閉じたときの文の既定 */
export const CLOSED_MESSAGE = "Kickoff のコアのプロセスが止まりました";

/**
 * 口の上に RPC を作る。handlers は相手から呼ばれる口（Local の表のとおり）。timeoutOf はこちらから呼ぶときの時間の上限（null は上限なし）
 */
export function createRpc<Local, Remote, LocalEvents, RemoteEvents>(
  port: RpcPort,
  opts: { handlers: Fns<Local>; timeoutOf?: (method: string) => number | null; timers?: RpcTimers; closedMessage?: string },
): Rpc<Remote, LocalEvents, RemoteEvents> {
  const timers = opts.timers ?? realTimers;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: unknown }>();
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  let nextId = 1;
  let closed = false;
  const handlers = opts.handlers as Record<string, AnyFn | undefined>;

  const send = (message: RpcMessage) => {
    if (closed) return;
    try {
      port.post(message);
    } catch {
      // 相手がもういない（閉じた知らせが遅れて届く）
    }
  };

  const settle = (id: number, outcome: { ok: true; value: unknown } | { ok: false; error: string }) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (p.timer !== undefined) timers.clear(p.timer);
    if (outcome.ok) p.resolve(outcome.value);
    else p.reject(new Error(outcome.error));
  };

  const answer = async (id: number, method: string, args: unknown[]) => {
    const fn = handlers[method];
    if (!fn) return send({ t: "result", id, ok: false, error: `知らない呼び出しです: ${method}` });
    try {
      send({ t: "result", id, ok: true, value: await fn(...args) });
    } catch (e) {
      send({ t: "result", id, ok: false, error: errorMessage(e) });
    }
  };

  const offMessage = port.onMessage((m) => {
    if (!isRpcMessage(m)) return;
    if (m.t === "call") void answer(m.id, m.method, m.args);
    else if (m.t === "result") settle(m.id, m.ok ? { ok: true, value: m.value } : { ok: false, error: m.error });
    else for (const fn of [...(listeners.get(m.name) ?? [])]) fn(m.payload);
  });

  const close = (reason = opts.closedMessage ?? CLOSED_MESSAGE) => {
    if (closed) return;
    closed = true;
    offMessage();
    offClose();
    for (const id of [...pending.keys()]) settle(id, { ok: false, error: reason });
  };
  const offClose = port.onClose(() => close());

  return {
    call: ((method: string, ...args: unknown[]) => {
      if (closed) return Promise.reject(new Error(opts.closedMessage ?? CLOSED_MESSAGE));
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const ms = opts.timeoutOf?.(method) ?? null;
        const timer = ms === null ? undefined : timers.set(() => settle(id, { ok: false, error: `${method} が ${Math.round(ms / 1000)} 秒で返りませんでした` }), ms);
        pending.set(id, { resolve, reject, timer });
        send({ t: "call", id, method, args });
      });
    }) as unknown as Rpc<Remote, LocalEvents, RemoteEvents>["call"],
    emit: (name, payload) => send({ t: "event", name, payload }),
    on: (name, fn) => {
      const set = listeners.get(name) ?? new Set();
      set.add(fn as (payload: unknown) => void);
      listeners.set(name, set);
      return () => void set.delete(fn as (payload: unknown) => void);
    },
    close,
  };
}
