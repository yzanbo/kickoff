// コアの側の DB ワーカーの窓口: 初めて頼んだときに起動し、頼みに番号を付けて送り、答えを待つ。何もしない状態が続いたら止める。
// ワーカーが落ちても、待っている頼みを失敗にするだけで、次の頼みで起動し直す（コアは落ちない）
import { fork } from "node:child_process";
import { errorMessage } from "@shared/errors";
import type { DbEngine } from "@shared/types";
import type { WorkerCancel, WorkerMethod, WorkerMethods, WorkerRequest, WorkerResponse } from "./protocol.js";
import { createWorkerHandler } from "./worker/handler.js";

/** ワーカーとのつなぎ（別のプロセス・テストでは同じプロセス） */
export interface WorkerChannel {
  send(message: WorkerRequest | WorkerCancel): void;
  onMessage(fn: (res: WorkerResponse) => void): void;
  /** 止まった（自分で止めたときは呼ばない） */
  onExit(fn: (reason: string) => void): void;
  kill(): void;
}

/** ワーカーの起動のしかた（Electron は自分の実行ファイルを ELECTRON_RUN_AS_NODE で、単体のコア・テストは node ＋ tsx で動かす） */
export interface WorkerEntry {
  file: string;
  execArgv: string[];
  electron: boolean;
}

/** 別のプロセスで起動する */
export function forkWorker(entry: WorkerEntry): WorkerChannel {
  const child = fork(entry.file, [], {
    execArgv: entry.execArgv,
    env: entry.electron ? { ...process.env, ELECTRON_RUN_AS_NODE: "1" } : process.env,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    // 自分のプロセスグループにする（止めるときにグループごと送り、ワーカーが開いた SSH トンネルの ssh も残さない）
    detached: true,
  });
  let killed = false;
  return {
    send: (message) => {
      if (child.connected) child.send(message);
    },
    onMessage: (fn) => child.on("message", (m) => fn(m as WorkerResponse)),
    onExit: (fn) => {
      child.on("exit", (code, signal) => !killed && fn(signal ? `シグナル ${signal}` : `終了コード ${code}`));
      child.on("error", (e) => !killed && fn(errorMessage(e)));
    },
    kill: () => {
      killed = true;
      // JS の受け口は使わない（SQLite の文を流している間は動けず、止められなくなる）。OS がグループごと止める
      try {
        if (child.pid) process.kill(-child.pid, "SIGTERM");
        else child.kill();
      } catch {
        child.kill();
      }
    },
  };
}

/** 同じプロセスで動かす（テスト用。本物のワーカーと同じ中身を使う） */
export function inProcessWorker(): WorkerChannel {
  const handler = createWorkerHandler();
  let listener: (res: WorkerResponse) => void = () => {};
  return {
    send: (message) => {
      if ("cancel" in message) void handler.cancel(message.cancel);
      else void handler.handle(message).then((res) => listener(res));
    },
    onMessage: (fn) => (listener = fn),
    onExit: () => {},
    kill: () => void handler.closeAll(),
  };
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (e: Error) => void;
  engine: DbEngine | null;
}

/** 何もしない状態がこれだけ続いたらワーカーを止める */
const IDLE_MS = 5 * 60_000;

export class DbWorkerClient {
  private channel: WorkerChannel | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  /** トランザクションの途中の接続（あれば何もしなくても止めない。止めると取り消されるため） */
  private readonly inTransaction = new Set<string>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly spawn: () => WorkerChannel,
    private readonly idleMs = IDLE_MS,
  ) {}

  /** ワーカーが動いているか */
  get running() {
    return this.channel !== null;
  }

  /** トランザクションの途中か（SQL のタブのコミットしていない印。ワーカーが止まれば false） */
  isInTransaction(session: string) {
    return this.inTransaction.has(session);
  }

  private ensure(): WorkerChannel {
    if (this.channel) return this.channel;
    const channel = this.spawn();
    channel.onMessage((res) => this.settle(res));
    channel.onExit((reason) => {
      if (this.channel !== channel) return;
      this.channel = null;
      this.failAll(`DB ワーカーが止まりました（${reason}）。もう一度試すと起動し直します`);
    });
    this.channel = channel;
    return channel;
  }

  private settle(res: WorkerResponse) {
    const p = this.pending.get(res.id);
    if (!p) return;
    this.pending.delete(res.id);
    if (res.ok) p.resolve(res.result);
    else p.reject(new Error(res.error));
    this.scheduleIdle();
  }

  private failAll(message: string) {
    const all = [...this.pending.values()];
    this.pending.clear();
    this.inTransaction.clear();
    for (const p of all) p.reject(new Error(message));
  }

  private scheduleIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (this.pending.size > 0 || !this.channel) return;
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0 && this.inTransaction.size === 0) this.stop();
    }, this.idleMs);
    this.idleTimer.unref?.();
  }

  /** 頼む（signal で止める。engine は止め方を決めるのに使う。SQLite はワーカーごと止める） */
  request<M extends WorkerMethod>(method: M, params: WorkerMethods[M]["params"], opts: { signal?: AbortSignal; engine?: DbEngine } = {}): Promise<WorkerMethods[M]["result"]> {
    const channel = this.ensure();
    const id = this.nextId++;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, engine: opts.engine ?? null });
    });
    channel.send({ id, method, params });
    opts.signal?.addEventListener("abort", () => this.cancel(id), { once: true });
    return promise.then((result) => {
      this.track(method, params, result);
      return result as WorkerMethods[M]["result"];
    });
  }

  /** トランザクションの途中かを答えから覚える */
  private track(method: WorkerMethod, params: unknown, result: unknown) {
    if (method === "closeMatching") {
      const { prefixes } = params as WorkerMethods["closeMatching"]["params"];
      for (const s of [...this.inTransaction]) if (prefixes.some((p) => s.startsWith(p))) this.inTransaction.delete(s);
      return;
    }
    const session = (params as { session?: string }).session;
    if (!session) return;
    if (method === "close") this.inTransaction.delete(session);
    const state = (result as { in_transaction?: boolean } | null)?.in_transaction;
    if (state === true) this.inTransaction.add(session);
    else if (state === false) this.inTransaction.delete(session);
  }

  /** 流している頼みを止める（SQLite は文を流している間ワーカーが受け取れないので、ワーカーごと止めて起動し直す） */
  private cancel(id: number) {
    const p = this.pending.get(id);
    if (!p || !this.channel) return;
    if (p.engine === "sqlite") {
      this.pending.delete(id);
      p.reject(new Error("止めました"));
      this.stop("止めた文と同じ DB ワーカーで動いていたため、途中の頼みも止めました（SQLite の文は、ワーカーごと止めて止めます）");
      return;
    }
    this.channel.send({ cancel: id });
  }

  /** ワーカーを止める（待っている頼みは失敗にする） */
  stop(message = "DB ワーカーを止めました") {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const channel = this.channel;
    this.channel = null;
    channel?.kill();
    this.failAll(message);
  }
}
