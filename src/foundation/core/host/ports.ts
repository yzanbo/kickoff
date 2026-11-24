// メインとコアのやり取りの口の形をそろえる（Electron の parentPort・MessagePortMain・Node の MessagePort の違いを吸う）。
// RPC（rpc.ts）とコアのプロセスの入口（run.ts）はこの形だけを使う。メインの側の口（utilityProcess の子）は main/app/coreProcess.ts で同じ形に包む
import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { systemClock } from "@/foundation/core/clock";

/** やり取りの口。onMessage・onClose は受けるのをやめる関数を返す */
export interface RpcPort {
  /** 送る（transfer: 添えて渡す口。DB ワーカーの MessagePort） */
  post(message: unknown, transfer?: unknown[]): void;
  /** 届いたもの（ports: 添えて届いた口） */
  onMessage(fn: (message: unknown, ports: unknown[]) => void): () => void;
  /** 相手が終わった・口が閉じた（1 回だけ呼ぶ） */
  onClose(fn: () => void): () => void;
}

/** 受け手の一覧（足した順に呼ぶ） */
function listeners<A extends unknown[]>() {
  const set = new Set<(...args: A) => void>();
  return {
    add(fn: (...args: A) => void) {
      set.add(fn);
      return () => void set.delete(fn);
    },
    emit: (...args: A) => {
      for (const fn of [...set]) fn(...args);
    },
  };
}

/**
 * Node の MessagePort（テストの MessageChannel）を包む。Node は添えて渡した口を中身から参照しないと届けないので、
 * 中身と口を 1 つの包みにして送る（両端ともこの包みで使う）
 */
export function nodeRpcPort(port: NodeMessagePort): RpcPort {
  const messages = listeners<[unknown, unknown[]]>();
  const closes = listeners<[]>();
  let closed = false;
  port.on("message", (data: { m: unknown; p: unknown[] }) => messages.emit(data.m, data.p));
  port.on("close", () => {
    if (closed) return;
    closed = true;
    closes.emit();
  });
  return {
    post: (message, transfer = []) => port.postMessage({ m: message, p: transfer }, transfer as never),
    onMessage: messages.add,
    onClose: closes.add,
  };
}

/** Electron の utilityProcess の中だけにある親とのつなぎ（コアは Electron の型を読まないので、使う所だけの形にする） */
export interface ParentPortLike {
  on(event: "message", fn: (e: { data: unknown; ports?: unknown[] }) => void): void;
  postMessage(message: unknown, transfer?: unknown[]): void;
}

/**
 * コアのプロセスの側の、親（メインプロセス）とのつなぎ。parentPort には閉じた知らせがないので、親が消えたかは
 * 親の pid が変わった（launchd に引き取られた）ことで見る（watchMs ごと）
 */
export function parentRpcPort(parent: ParentPortLike, opts: { parentPid: () => number; watchMs?: number }): RpcPort {
  const messages = listeners<[unknown, unknown[]]>();
  const closes = listeners<[]>();
  const firstParent = opts.parentPid();
  let closed = false;
  parent.on("message", (e) => messages.emit(e.data, e.ports ?? []));
  const timer = systemClock.setInterval(() => {
    if (closed || opts.parentPid() === firstParent) return;
    closed = true;
    systemClock.clearInterval(timer);
    closes.emit();
  }, opts.watchMs ?? 1000);
  return {
    post: (message, transfer) => parent.postMessage(message, transfer),
    onMessage: messages.add,
    onClose: closes.add,
  };
}
