// コアのプロセス（utilityProcess）の見張り役: 起動して ready を待ち、落ちたら子を止めてから作り直し、応答しなければ知らせ、終わらせる（1 つ分の起動は coreChild.ts・
// 応答の見張りは coreWatchdog.ts・様子の移り変わりは coreState.ts・DB ワーカーは dbWorkers.ts・残った子は leftovers.ts）。コアは HTTP・SSE・WebSocket・SQLite・エージェント・ターミナル・MCP サーバーを持ち、メインは窓・OS の口・仲立ちだけを持つ（メインの JavaScript の糸は画面の入力の道でもあるので、コアの重さを乗せない）
import type { UtilityProcess } from "electron";
import { errorMessage } from "@shared/foundation/errors";
import { sleep } from "@shared/foundation/time";
import type { CoreState } from "@shared/foundation/ipc";
import { createSignal, type Signal } from "@shared/foundation/signal";
import type { AwakeNeeds, CoreEvents, CoreMethods, CoreReady, RecoveredReason } from "@/foundation/core/host/protocol";
import type { ChildProcessNote } from "@/foundation/core/system/childProcesses";
import type { CoreRpc } from "@/foundation/core/host/rpc";
import { applyChildNote, type CoreChildren } from "./coreChildren";
import { CRASH_HISTORY_MS, restartDelay } from "./coreRestart";
import { coreStateAfter, type CoreStateEvent } from "./coreState";
import { forkCore, killCore, type CoreProcessOptions } from "./coreChild";

export type { HostHandlers } from "./coreChild";
import { CORE_PING_EVERY_MS, CORE_UNRESPONSIVE_MS, createWatchdog, type Watchdog } from "./coreWatchdog";
import { DbWorkerPool } from "./dbWorkers";
import { stopLeftovers } from "./leftovers";

/** コアからの知らせのうち、メインの部品へ配るもの */
const FORWARDED = ["notify", "awake", "browser.touch", "stall", "children"] as const;

export class CoreProcess {
  state: CoreState = "starting";
  private child: UtilityProcess | null = null;
  private rpc: CoreRpc | null = null;
  private exited: Promise<void> = Promise.resolve();
  private readonly events = new Map<string, Signal<unknown>>(FORWARDED.map((name) => [name, createSignal<unknown>()]));
  private readonly states = createSignal<CoreState>();
  private readonly children: CoreChildren = new Map();
  private readonly dbWorkers: DbWorkerPool;
  private readonly watchdog: Watchdog;
  private crashTimes: number[] = [];
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private closing = false;
  /** ready を受けたコアの pid（落ちたあと、止める子の親として確かめる） */
  private corePid: number | null = null;
  ready: CoreReady | null = null;
  /** コアから届いた最後の眠らせない理由（落ちたら null） */
  lastAwake: AwakeNeeds | null = null;

  constructor(private readonly opts: CoreProcessOptions) {
    this.dbWorkers = new DbWorkerPool(opts.dbWorkerFile, (workerId, reason) => this.rpc?.emit("dbWorker.exit", { workerId, reason }));
    this.watchdog = createWatchdog({
      ping: () => (this.rpc && !this.closing ? this.rpc.call("ping") : null),
      everyMs: CORE_PING_EVERY_MS,
      limitMs: CORE_UNRESPONSIVE_MS,
      onResponded: () => {
        if (this.state === "unresponsive") this.opts.log("コアが応答するようになりました");
        this.transition("responded");
      },
      onSilent: (silentMs) => {
        if (this.state === "ready") this.opts.log(`コアが ${Math.round(silentMs / 1000)} 秒応答しません`);
        this.transition("silent");
      },
    });
  }

  /** コアからの知らせを受ける（作り直しても受け続ける） */
  on<K extends (typeof FORWARDED)[number]>(name: K, fn: (payload: CoreEvents[K]) => void): () => void {
    return this.events.get(name)!.subscribe(fn as (payload: unknown) => void);
  }

  /** 様子の変化を受ける（眠らせない仕組みなど） */
  onState(fn: (state: CoreState) => void): () => void {
    return this.states.subscribe(fn);
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

  private transition(event: CoreStateEvent) {
    const next = coreStateAfter(this.state, event);
    if (this.state === next) return;
    this.state = next;
    this.opts.onState(next);
    this.states.emit(next);
  }

  /** fork → init → ready / failed / exit を待つ */
  private spawn(recoveredReason: RecoveredReason): Promise<CoreReady> {
    const core = forkCore({
      file: this.opts.file,
      args: this.opts.args,
      init: this.opts.init(recoveredReason),
      handlers: (child) => ({
        ...this.opts.handlers,
        "dbWorker.spawn": async (env) => this.dbWorkers.spawn(child, env),
        "dbWorker.kill": async (workerId) => this.dbWorkers.kill(workerId),
      }),
      onExit: (code, afterReady) => {
        if (this.child === core.child) {
          this.child = null;
          this.rpc = null;
        }
        // 起動の途中で終わった・終了の途中・自分で止めたときは作り直さない（作り直すときは呼んだ側が続ける）
        if (!afterReady || this.closing || this.state === "restarting") return;
        this.opts.log(`コアのプロセスが落ちました 終了コード ${code}`);
        void this.recover();
      },
    });
    this.child = core.child;
    this.rpc = core.rpc;
    this.exited = core.exited;
    for (const name of FORWARDED) core.rpc.on(name, (payload) => this.events.get(name)?.emit(payload));
    core.rpc.on("children", (note: ChildProcessNote) => applyChildNote(this.children, note));
    core.rpc.on("awake", (needs) => (this.lastAwake = needs));
    return core.ready.then((ready) => {
      this.ready = ready;
      this.corePid = ready.pid;
      this.watchdog.reset();
      this.watchdog.start();
      this.transition("ready");
      return ready;
    });
  }

  /** 応答しないまま待つ（また 30 秒応答しなければ知らせる） */
  wait() {
    if (this.state !== "unresponsive") return;
    this.watchdog.reset();
    this.transition("waited");
  }

  /** 残った子を止める（親として確かめるのは落ちたコアと DB ワーカー。ワーカーも止める） */
  private async stopLeftovers() {
    const parents = [...(this.corePid !== null ? [this.corePid] : []), ...this.dbWorkers.pids()];
    this.dbWorkers.killAll();
    await stopLeftovers(this.children, parents, this.opts.host, this.opts.log);
  }

  /** 落ちたあと: 子を止め、待ってから作り直す（5 分に 3 回落ちたら止める） */
  private async recover() {
    this.watchdog.stop();
    this.lastAwake = null;
    const now = Date.now();
    this.crashTimes = [...this.crashTimes.filter((t) => now - t < CRASH_HISTORY_MS), now];
    const delay = restartDelay(this.crashTimes, now);
    this.transition(delay === null ? "gaveUp" : "restarting");
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
    this.transition("restarting");
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
    this.transition("restarting");
    this.watchdog.stop();
    if (this.child) await killCore(this.child, this.exited);
    await this.stopLeftovers();
    await this.respawn();
  }

  /** 終了: close を頼み、exit を待つ。timeoutMs を過ぎたら kill（SIGTERM）して待たずに返す */
  async close(timeoutMs: number): Promise<void> {
    this.closing = true;
    this.watchdog.stop();
    if (this.restartTimer) clearTimeout(this.restartTimer);
    const child = this.child;
    if (child) {
      const deadline = Date.now() + timeoutMs;
      await Promise.race([this.call("close").catch(() => {}), sleep(timeoutMs)]);
      const done = await Promise.race([this.exited.then(() => true), sleep(Math.max(0, deadline - Date.now())).then(() => false)]);
      if (!done) child.kill();
    }
    this.dbWorkers.killAll();
  }
}
