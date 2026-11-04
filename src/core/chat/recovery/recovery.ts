import type { ApprovalCenter } from "../approvals.js";
import { errorMessage } from "@shared/errors";
import type { Store } from "../../db/store.js";
import type { ChatRuntime, ChatRuntimes } from "../runtime.js";
import type { TurnOutcome } from "../turn.js";
import { Poller } from "./poller.js";
import { canReachApi } from "./reachability.js";
import { reconnectRule, usageLimitRule, type RecoveryPlan, type RecoveryReason, type RecoveryRule } from "./rules.js";
import type { RecoveryWait } from "./state.js";
import type { PlanUsage } from "@shared/types";

/** つながったかを確かめる間隔 */
const ONLINE_CHECK_MS = 15_000;

/** 枠が戻る時刻を過ぎたかを確かめる間隔（Mac がスリープしても遅れないよう、待つ時間ではなく時計の時刻で見る） */
const CLOCK_CHECK_MS = 60_000;

/**
 * 止まったあとの再開の段取り（通信の切断・使用枠の上限で止まったとき。Runner から使う）。理由ごとの違い（待つ条件・知らせる文・聞く文・
 * 再開の文）は rules.ts の RecoveryRule に任せ、流れはここで 1 つにする:
 * 1. 止まったら、送信待ちを送らずに止めておく（保留。送っても失敗して消えるため。自分で止めていたものはそのまま）
 * 2. 決まりの段取りで、条件を待つ（つながる・枠が戻る時刻）・再開するかを聞く（承認のカードと同じ回答待ち）
 * 3. 再開の指示を送り、その作業が最後まで終わったら止めた送信待ちを戻す
 * 自分で送った・チャットを消したら、待つのも聞くのもやめる（止めた送信待ちは止めたまま。自分で戻せる）。
 * チャットごとの状態は ChatRuntime の recovery に 1 つで持つので、続けて別の理由で止まっても、止めた送信待ちを引き継ぐ
 */
export class ChatRecovery {
  private readonly rules: Record<RecoveryReason, RecoveryRule>;
  private readonly online: Poller;
  private readonly clock: Poller;
  private readonly now: () => number;

  constructor(
    private readonly deps: {
      store: Store;
      approvals: ApprovalCenter;
      runtimes: ChatRuntimes;
      isBusy: (chatId: number) => boolean;
      send: (chatId: number, text: string) => Promise<unknown>;
      /** 枠の使い方（Claude Code が枠の戻る時刻を知らせなかったときに使う） */
      usage?: { get(): Promise<PlanUsage> };
      /** つながったかの確かめ方と間隔（テストで差し替える） */
      reconnect?: { check?: () => Promise<boolean>; intervalMs?: number };
      /** 枠が戻ったかを確かめる時計と間隔（テストで差し替える） */
      usageLimit?: { now?: () => number; checkMs?: number };
    },
  ) {
    this.rules = { reconnect: reconnectRule(deps), usage_limit: usageLimitRule(deps) };
    this.now = deps.usageLimit?.now ?? Date.now;
    const check = deps.reconnect?.check ?? canReachApi;
    this.online = new Poller({
      intervalMs: deps.reconnect?.intervalMs ?? ONLINE_CHECK_MS,
      active: () => this.waitingFor("online").length > 0,
      tick: async () => {
        if (this.waitingFor("online").length === 0 || !(await check().catch(() => false))) return;
        // 確かめている間に待ち始めたチャットも、いまつながっているので一緒に再開する
        for (const runtime of this.waitingFor("online")) this.ready(runtime);
      },
    });
    this.clock = new Poller({
      intervalMs: deps.usageLimit?.checkMs ?? CLOCK_CHECK_MS,
      active: () => this.waitingFor("clock").length > 0,
      tick: () => this.checkClock(),
    });
  }

  /**
   * 作業が終わったとき。送信待ちを送ってよいかを返す（通信の切断・使用枠の上限で止まったときは送らない）
   */
  finished(chatId: number, outcome: TurnOutcome): boolean {
    const runtime = this.deps.runtimes.get(chatId);
    const state = runtime.recovery;
    const rule = outcome.network ? this.rules.reconnect : outcome.usageLimit ? this.rules.usage_limit : undefined;
    // 自動で再開した回数と、通信で止まったサブエージェントは、通信の切断が続いている間だけ覚えておく
    // （ほかの理由で終わったら、止まったサブエージェントの再開は頼まない。一覧の「再開」で戻せる）
    if (rule?.reason !== "reconnect") {
      state.attempts = 0;
      state.agents.clear();
    }
    if (rule) {
      this.stop(runtime, rule, outcome);
      return false;
    }
    // 最後まで終わった: 止めた送信待ちを戻す。止めた・ほかの理由で失敗した: 止めたまま（自分で戻せる）
    if (state.held && outcome.status === "completed") runtime.queue.setPaused(false);
    state.held = false;
    return true;
  }

  /** 自分でメッセージを送った・チャットを消した: 待つのも聞くのもやめる（再開の指示を送っているところなら何もしない） */
  forget(chatId: number) {
    const runtime = this.deps.runtimes.peek(chatId);
    if (!runtime || runtime.recovery.resuming) return;
    const state = runtime.recovery;
    state.version++;
    this.cancel(runtime);
    state.attempts = 0;
    state.agents.clear();
    state.held = false;
  }

  /** つながったら自動で再開するのをやめる（画面の「自動で再開しない」）。待っていたら true */
  stopWaiting(chatId: number): boolean {
    const runtime = this.deps.runtimes.peek(chatId);
    if (runtime?.recovery.waiting?.for.kind !== "online") return false;
    this.setWaiting(runtime, null);
    return true;
  }

  /** アプリを終えるとき（もう待たない） */
  shutdown() {
    this.online.stop();
    this.clock.stop();
  }

  /** 止まった: 送信待ちを止めて、決まりの段取り（お知らせ・待つ・聞く）を始める（前の段取りは置き換える） */
  private stop(runtime: ChatRuntime, rule: RecoveryRule, outcome: TurnOutcome) {
    const { chatId, queue, recovery: state } = runtime;
    if (!this.deps.store.chats.get(chatId)) return;
    const version = ++state.version;
    this.cancel(runtime);
    for (const a of outcome.stoppedAgents ?? []) state.agents.set(a.agentId, a.description);
    // 送信待ちを自分で止めていたか（こちらで止めたものは、どの理由で止めたものでも自分で止めたものではない）
    const pausedByUser = queue.isPaused() && !state.held;
    // 送信待ちは送らずに止めておく（止まったまま送ると、次々に失敗して消えるため）
    if (queue.list().length > 0 && !queue.isPaused()) {
      queue.setPaused(true);
      state.held = true;
    }
    // 段取りは、決まりがすぐ決められればその場で、調べものが要れば（枠の戻る時刻）調べてから進める
    const plan = rule.plan({ chatId, state, pausedByUser, outcome });
    if (plan instanceof Promise) void plan.then((p) => this.follow(runtime, rule, p, version));
    else this.follow(runtime, rule, plan, version);
  }

  /** 決まった段取りを進める（決めている間に自分で送った・また止まったなら、もうこの段取りではないのでやめる） */
  private follow(runtime: ChatRuntime, rule: RecoveryRule, plan: RecoveryPlan, version: number) {
    if (runtime.recovery.version !== version) return;
    if (plan.notice) this.deps.store.events.add(runtime.chatId, { type: "notice", message: plan.notice });
    if (plan.next.do === "ask") this.ask(runtime, rule);
    else if (plan.next.do === "wait") this.setWaiting(runtime, { rule, for: plan.next.for, then: plan.next.then });
  }

  /** 条件を満たした: 決まりのとおり、再開する・聞く */
  private ready(runtime: ChatRuntime) {
    const waiting = runtime.recovery.waiting;
    if (!waiting) return;
    this.setWaiting(runtime, null);
    if (waiting.then === "ask") this.ask(runtime, waiting.rule);
    else void this.resume(runtime, waiting.rule, { counted: true });
  }

  /** 再開するかを聞く（承認のカードと同じ回答待ち。Mac の通知も出る）。その間に自分で再開していたら聞かない */
  private ask(runtime: ChatRuntime, rule: RecoveryRule) {
    const { store, approvals, isBusy } = this.deps;
    const { chatId, recovery: state } = runtime;
    const chat = store.chats.get(chatId);
    if (!chat || chat.status !== "failed" || isBusy(chatId) || state.asking) return;
    const controller = new AbortController();
    state.asking = controller;
    const { title, description, input } = rule.ask({ chatId, state });
    const { decision } = approvals.request(
      { chatId, projectId: chat.project_id },
      { kind: rule.reason, toolName: rule.reason, input, title, description, canRemember: false },
      controller.signal,
    );
    void decision.then((answer) => {
      // 取り下げた（自分で送った・また止まった）: もうこの段取りではない
      if (state.asking !== controller) return;
      state.asking = null;
      state.attempts = 0;
      // 再開する: 数え直して、すぐ送る（また止まったら、決まりの段取りから）
      if (answer.action === "allow") void this.resume(runtime, rule, { counted: false });
      // やめる: 送信待ちは止めたまま（自分で戻す・メッセージを送ると続きから再開できる）
      else state.held = false;
    });
  }

  /** 再開の指示を送る（止まったままでないとき（その間に自分で動かした）・作業中なら送らない）。counted: 自動で再開した回数に数える */
  private async resume(runtime: ChatRuntime, rule: RecoveryRule, { counted }: { counted: boolean }) {
    const { store, isBusy, send } = this.deps;
    const { chatId, recovery: state } = runtime;
    const chat = store.chats.get(chatId);
    if (!chat || chat.status !== "failed" || isBusy(chatId)) return;
    if (counted) state.attempts++;
    state.resuming = true;
    try {
      await send(chatId, rule.prompt({ chatId, state }));
    } catch (e) {
      store.events.add(chatId, { type: "error", message: `${rule.resumeFailed}: ${errorMessage(e)}` });
    } finally {
      state.resuming = false;
    }
  }

  /** 待つのも聞くのもやめる（聞いていたら取り下げる） */
  private cancel(runtime: ChatRuntime) {
    this.setWaiting(runtime, null);
    const asking = runtime.recovery.asking;
    runtime.recovery.asking = null;
    asking?.abort();
  }

  /** 待つ条件を変える。つながるのを待っているかが変わったら、作業中の様子を配り直す（時刻を待つなら、もう過ぎていないかをすぐ確かめる） */
  private setWaiting(runtime: ChatRuntime, waiting: RecoveryWait | null) {
    const before = runtime.recovery.waiting;
    runtime.recovery.waiting = waiting;
    if (before?.for.kind === "online" || waiting?.for.kind === "online") this.deps.runtimes.publish(runtime.chatId);
    if (waiting?.for.kind === "online") this.online.start();
    if (waiting?.for.kind === "clock") {
      this.checkClock();
      this.clock.start();
    }
  }

  /** 枠が戻る時刻を過ぎたチャットを、決まりのとおりに進める */
  private checkClock() {
    const now = this.now();
    for (const runtime of this.waitingFor("clock")) {
      const wait = runtime.recovery.waiting!.for;
      if (wait.kind === "clock" && now >= wait.at) this.ready(runtime);
    }
  }

  /** その条件を待っているチャット */
  private waitingFor(kind: "online" | "clock"): ChatRuntime[] {
    return this.deps.runtimes.all().filter((r) => r.recovery.waiting?.for.kind === kind);
  }
}
