// コアのプロセス（utilityProcess）の見張り役: 起動して ready を待ち、RPC をつなぎ、落ちたら子を止めてから作り直し、応答しなければ知らせ、終わらせる。
// コアは HTTP・SSE・WebSocket・SQLite・エージェント・ターミナル・MCP サーバーを持ち、メインは窓・OS の口・仲立ちだけを持つ
// （メインの JavaScript の糸は画面の入力の道でもあるので、コアの重さを乗せない）
import { MessageChannelMain, utilityProcess, type MessagePortMain, type UtilityProcess } from "electron";
import { errorMessage } from "@shared/errors";
import type { CoreState } from "@shared/ipc";
import type { AwakeNeeds, ChildProcessNote, CoreEvents, CoreInit, CoreMethods, CoreReady, HostEvents, HostMethods, HostToCore, RecoveredReason } from "../../core/host/protocol.js";
import { rpcTimeoutOf } from "../../core/host/protocol.js";
import type { RpcPort } from "../../core/host/ports.js";
import type { CoreRpc } from "../../core/host/remote.js";
import { createRpc } from "../../core/host/rpc.js";
import type { ProcessRow } from "../../core/platform/types.js";
import { applyChildNote, childrenToStop, type CoreChildren } from "./coreChildren.js";
import { restartDelay } from "./coreRestart.js";

/** 応答の見張りの間隔と、知らせるまでの長さ（一時の重さ = 大きな SQL などで知らせない） */
const PING_EVERY_MS = 5_000;
const UNRESPONSIVE_MS = 30_000;
/** 子を SIGTERM で止めてから SIGKILL を送るまで */
const CHILD_KILL_WAIT_MS = 2_000;
/** 応答しないコアを SIGTERM で止めてから SIGKILL を送るまで */
const CORE_KILL_WAIT_MS = 3_000;

/** コア → メインの呼び出し（埋め込みブラウザ・キーチェーンの鍵）の中身。DB ワーカーは見張り役が持つ */
export type HostHandlers = Omit<HostMethods, "dbWorker.spawn" | "dbWorker.kill">;

interface CoreProcessOptions {
  /** ビルドの out/main/core.js */
  file: string;
  /** 起動の引数（コンパイルキャッシュの場所） */
  args: string[];
  /** DB ワーカー（out/main/dbWorker.js。作るのはメイン、話すのはコア） */
  dbWorkerFile: string;
  /** 起動の値（作り直すたびに作る。recoveredReason は前のコアの終わり方） */
  init: (recoveredReason: RecoveredReason) => CoreInit;
  handlers: HostHandlers;
  /** 様子が変わった（画面の帯・眠らせない・起動の記録） */
  onState: (state: CoreState) => void;
  /** 起動の記録に書く */
  log: (message: string) => void;
  /** プロセスの表（落ちたときに止める子を確かめる） */
  processTable: () => Promise<ReadonlyMap<number, ProcessRow>>;
}

type Listener<K extends keyof CoreEvents> = (payload: CoreEvents[K]) => void;

/** utilityProcess の子を RpcPort の形に包む（メインの側。閉じた = 子が終わった） */
function childPort(child: UtilityProcess): RpcPort {
  return {
    post: (message, transfer) => child.postMessage(message, (transfer ?? []) as MessagePortMain[]),
    onMessage: (fn) => {
      const listener = (m: unknown) => fn(m, []);
      child.on("message", listener);
      return () => void child.off("message", listener);
    },
    onClose: (fn) => {
      child.once("exit", () => fn());
      return () => {};
    },
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const signal = (pid: number, group: boolean, sig: NodeJS.Signals) => {
  try {
    process.kill(group ? -pid : pid, sig);
  } catch {
    // もう終わっている
  }
};

export class CoreProcess {
  state: CoreState = "starting";
  private child: UtilityProcess | null = null;
  private rpc: CoreRpc | null = null;
  private exited: Promise<void> = Promise.resolve();
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
  private readonly stateListeners = new Set<(state: CoreState) => void>();
  private readonly children: CoreChildren = new Map();
  private readonly dbWorkers = new Map<number, UtilityProcess>();
  private nextWorkerId = 1;
  private crashTimes: number[] = [];
  private lastPong = Date.now();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private closing = false;
  /** ready を受けたコアの pid（落ちたあと、止める子の親として確かめる） */
  private corePid: number | null = null;
  ready: CoreReady | null = null;
  /** コアから届いた最後の眠らせない理由（落ちたら null） */
  lastAwake: AwakeNeeds | null = null;

  constructor(private readonly opts: CoreProcessOptions) {}

  /** コアからの知らせを受ける（作り直しても受け続ける） */
  on<K extends keyof CoreEvents>(name: K, fn: Listener<K>): () => void {
    const set = this.listeners.get(name) ?? new Set();
    set.add(fn as (payload: unknown) => void);
    this.listeners.set(name, set);
    return () => void set.delete(fn as (payload: unknown) => void);
  }

  /** 様子の変化を受ける（眠らせない仕組みなど） */
  onState(fn: (state: CoreState) => void): () => void {
    this.stateListeners.add(fn);
    return () => void this.stateListeners.delete(fn);
  }

  /** コアを呼ぶ（いまのコアがなければ失敗） */
  call<M extends keyof CoreMethods & string>(method: M, ...args: Parameters<CoreMethods[M]>): ReturnType<CoreMethods[M]> {
    if (!this.rpc) return Promise.reject(new Error("Kickoff のコアが動いていません")) as ReturnType<CoreMethods[M]>;
    return this.rpc.call(method, ...args);
  }

  /** 最初の起動（失敗したら投げる。メインは「Kickoff を起動できません」を出して終える） */
  start(): Promise<CoreReady> {
    return this.spawn("quit");
  }

  private setState(state: CoreState) {
    if (this.state === state) return;
    this.state = state;
    this.opts.onState(state);
    for (const fn of [...this.stateListeners]) fn(state);
  }

  private emit(name: string, payload: unknown) {
    for (const fn of [...(this.listeners.get(name) ?? [])]) fn(payload);
  }

  /** fork → init → ready / failed / exit を待つ */
  private spawn(recoveredReason: RecoveredReason): Promise<CoreReady> {
    const child = utilityProcess.fork(this.opts.file, this.opts.args, {
      serviceName: "Kickoff Core",
      stdio: "inherit",
      env: process.env,
      execArgv: ["--disable-warning=ExperimentalWarning"],
    });
    this.child = child;
    const port = childPort(child);
    const rpc = createRpc<HostMethods, CoreMethods, HostEvents, CoreEvents>(port, {
      timeoutOf: rpcTimeoutOf,
      handlers: {
        ...this.opts.handlers,
        "dbWorker.spawn": async (env) => this.spawnDbWorker(child, env),
        "dbWorker.kill": async (workerId) => this.killDbWorker(workerId),
      },
    });
    this.rpc = rpc;
    for (const name of ["notify", "awake", "browser.touch", "stall", "children"] as const) rpc.on(name, (payload) => this.emit(name, payload));
    rpc.on("children", (note: ChildProcessNote) => applyChildNote(this.children, note));
    rpc.on("awake", (needs) => (this.lastAwake = needs));
    let resolveExit!: () => void;
    this.exited = new Promise((resolve) => (resolveExit = resolve));

    return new Promise<CoreReady>((resolve, reject) => {
      let settled = false;
      port.onMessage((m) => {
        const msg = m as { t?: string; ready?: CoreReady; message?: string };
        if (settled) return;
        if (msg.t === "ready" && msg.ready) {
          settled = true;
          this.ready = msg.ready;
          this.corePid = msg.ready.pid;
          this.lastPong = Date.now();
          this.startPing();
          this.setState("ready");
          resolve(msg.ready);
        } else if (msg.t === "failed") {
          settled = true;
          reject(new Error(msg.message ?? "コアを起動できません"));
        }
      });
      child.once("exit", (code) => {
        resolveExit();
        if (this.child === child) {
          this.child = null;
          this.rpc = null;
        }
        if (!settled) {
          settled = true;
          reject(new Error(`コアのプロセスが起動の途中で終わりました（終了コード ${code}）`));
          return;
        }
        // 終了の途中・自分で止めたときは作り直さない（作り直すときは呼んだ側が続ける）
        if (this.closing || this.state === "restarting") return;
        this.opts.log(`コアのプロセスが落ちました 終了コード ${code}`);
        void this.recover();
      });
      child.postMessage({ t: "init", init: this.opts.init(recoveredReason) } satisfies HostToCore);
    });
  }

  /** DB ワーカーを作り、コアと直結する MessagePort を両方に渡す（番号を返す） */
  private spawnDbWorker(core: UtilityProcess, env: Record<string, string>): number {
    const workerId = this.nextWorkerId++;
    const worker = utilityProcess.fork(this.opts.dbWorkerFile, [], { serviceName: "Kickoff DB Worker", execArgv: ["--disable-warning=ExperimentalWarning"], stdio: "inherit", env });
    this.dbWorkers.set(workerId, worker);
    const { port1, port2 } = new MessageChannelMain();
    worker.postMessage({ t: "port" }, [port1]);
    core.postMessage({ t: "port", purpose: "dbWorker", workerId } satisfies HostToCore, [port2]);
    const exit = (reason: string) => {
      if (!this.dbWorkers.has(workerId)) return;
      this.dbWorkers.delete(workerId);
      this.rpc?.emit("dbWorker.exit", { workerId, reason });
    };
    worker.once("exit", (code) => exit(`終了コード ${code}`));
    worker.on("error", (type, location) => exit(`${type}${location ? ` (${location})` : ""}`));
    return workerId;
  }

  /** JS の受け口は使わない（SQLite の文を流している間は動けない）。OS が SIGTERM で止める */
  private killDbWorker(workerId: number) {
    const worker = this.dbWorkers.get(workerId);
    this.dbWorkers.delete(workerId);
    worker?.kill();
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (!this.rpc || this.closing) return;
      this.rpc.call("ping").then(
        () => {
          this.lastPong = Date.now();
          if (this.state === "unresponsive") {
            this.opts.log("コアが応答するようになりました");
            this.setState("ready");
          }
        },
        () => {},
      );
      if (this.state === "ready" && Date.now() - this.lastPong > UNRESPONSIVE_MS) {
        this.opts.log(`コアが ${Math.round((Date.now() - this.lastPong) / 1000)} 秒応答しません`);
        this.setState("unresponsive");
      }
    }, PING_EVERY_MS);
    this.pingTimer.unref();
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /** 応答しないまま待つ（また 30 秒応答しなければ知らせる） */
  wait() {
    if (this.state !== "unresponsive") return;
    this.lastPong = Date.now();
    this.setState("ready");
  }

  /** 残った子（エージェントの CLI・DB ワーカーとその ssh・シェル）を止める（古い子が会話記録・作業場所を書いている間に、作り直したコアで再開が走ると食い違う） */
  private async stopLeftovers() {
    const parents = [this.corePid, ...[...this.dbWorkers.values()].map((w) => w.pid)].filter((p): p is number => typeof p === "number");
    for (const id of [...this.dbWorkers.keys()]) this.killDbWorker(id);
    let targets: { pid: number; group: boolean }[] = [];
    try {
      targets = childrenToStop(this.children, await this.opts.processTable(), parents);
    } catch (e) {
      this.opts.log(`残った子を調べられません: ${errorMessage(e)}`);
    }
    this.children.clear();
    if (targets.length === 0) return;
    this.opts.log(`残ったコアの子を止めます ${targets.map((t) => t.pid).join(",")}`);
    for (const t of targets) signal(t.pid, t.group, "SIGTERM");
    await sleep(CHILD_KILL_WAIT_MS);
    for (const t of targets) if (alive(t.pid)) signal(t.pid, t.group, "SIGKILL");
  }

  /** 落ちたあと: 子を止め、待ってから作り直す（5 分に 3 回落ちたら止める） */
  private async recover() {
    this.stopPing();
    this.lastAwake = null;
    const now = Date.now();
    this.crashTimes = [...this.crashTimes.filter((t) => now - t < 30 * 60_000), now];
    const delay = restartDelay(this.crashTimes, now);
    this.setState(delay === null ? "failed" : "restarting");
    await this.stopLeftovers();
    if (delay === null) {
      this.opts.log("コアが続けて落ちたので、作り直すのを止めました");
      return;
    }
    this.restartTimer = setTimeout(() => void this.respawn(), delay);
  }

  private async respawn() {
    this.restartTimer = null;
    if (this.closing) return;
    this.setState("restarting");
    try {
      await this.spawn("crash");
      this.opts.log("コアを作り直しました");
    } catch (e) {
      this.opts.log(`コアを作り直せません: ${errorMessage(e)}`);
      // 起動の途中で終わった・失敗したのも、落ちた回数に数える（古いコアの exit を確かめてから）
      await this.exited;
      void this.recover();
    }
  }

  /** 利用者が起動し直す（止まった・応答しないとき）。動いているコアは止めて、終わったのを確かめてから作り直す */
  async restart() {
    if (this.closing || (this.state !== "failed" && this.state !== "unresponsive")) return;
    this.opts.log(`利用者がコアを起動し直します（${this.state}）`);
    this.crashTimes = [];
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.setState("restarting");
    this.stopPing();
    const child = this.child;
    if (child) {
      child.kill();
      const done = await Promise.race([this.exited.then(() => true), sleep(CORE_KILL_WAIT_MS).then(() => false)]);
      if (!done && child.pid) signal(child.pid, false, "SIGKILL");
      await this.exited;
    }
    await this.stopLeftovers();
    await this.respawn();
  }

  /** 終了: close を頼み、exit を待つ。timeoutMs を過ぎたら kill（SIGTERM）して待たずに返す */
  async close(timeoutMs: number): Promise<void> {
    this.closing = true;
    this.stopPing();
    if (this.restartTimer) clearTimeout(this.restartTimer);
    const child = this.child;
    if (child) {
      const deadline = Date.now() + timeoutMs;
      await Promise.race([this.call("close").catch(() => {}), sleep(timeoutMs)]);
      const done = await Promise.race([this.exited.then(() => true), sleep(Math.max(0, deadline - Date.now())).then(() => false)]);
      if (!done) child.kill();
    }
    for (const id of [...this.dbWorkers.keys()]) this.killDbWorker(id);
  }
}
