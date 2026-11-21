import { randomUUID } from "node:crypto";
import { executeTurn, type ExecutionDeps, type TurnRequest } from "@/features/chat/core/turn";
import { ChatRuns } from "./chatRuns";
import type { ChatRun, TurnHandle } from "./chatRun";
import { liveOf } from "@/features/chat/core/live";
import { startTurn, tellItem } from "./turnStart";
import { step } from "@/features/chat/core/run/machine/step";
import { isBusy, isTellPending } from "@/features/chat/core/run/machine/state";
import type { ChatRunState, Effect, Env, RunEvent, TurnKind, TurnOutcome } from "@/features/chat/core/run/machine/types";
import { recordEvent } from "@/features/chat/core/run/record";
import { preCompactSent } from "@/features/chat/core/run/machine/marks";
import type { ChatRecovery } from "@/features/chat/core/run/recovery/recovery";
import type { UsageMonitor } from "@/features/ai/core/index";
import type { Clock } from "@/foundation/core/clock";
import { Conflict, Invalid, NotFound, type AppError } from "@/foundation/core/errors";
import type { OutboxEnv } from "@shared/chat/outbox";
import type { CompactTrigger } from "@shared/ai/turnEvents";
import type { TellResult } from "@shared/foundation/apiTypes";
import type { Chat } from "@shared/chat/types";
import { busyPreCompactMessage } from "@shared/chat/prompts";

/** 殻が受けるもの（1 回の実行に渡すもの・使用状況・時計・書き直しの持ち時間・出来事の記録の口） */
export interface ShellDeps extends ExecutionDeps {
  usage: UsageMonitor;
  clock: Clock;
  editHoldTtlMs?: number;
  /** 出来事・変わった項目・命令を 1 行ずつ書く口（KICKOFF_RUN_TRACE=1 のときだけ渡す） */
  trace?: (line: string) => void;
}

/** 上の機能の力が要る命令（作業の終わりにすること）と、プロジェクトの圧縮前指示（殻を組み立てる runner.ts が渡す） */
export interface ShellHooks {
  preCompactOf(projectId: number): string | null;
  turnEndTasks(chatId: number, run: ChatRun, effect: Extract<Effect, { do: "run_turn_end_tasks" | "drop_turn_end_tasks" }>): void;
}

/** 出来事を回した答え（渡した出来事の命令と、それが始めた作業の準備。命令の実行が出した出来事のものは含まない） */
export interface Dispatched {
  effects: Effect[];
  started: Promise<void>[];
  /** 出来事を回している間に渡したので、列に積んだだけ（答えはまだない） */
  queued?: boolean;
}

/** 決まりが断った理由を、失敗の種類の例外にする */
export const rejection = (status: 400 | 404 | 409, message: string): AppError => (status === 400 ? new Invalid(message) : status === 404 ? new NotFound(message) : new Conflict(message));

/**
 * チャットの実行の殻: 出来事を dispatch で 1 件ずつ純粋な step（machine/step.ts）に渡して状態を書き、返った命令を実行する
 * （作業を動かす・いまの作業に足す・記録・持ち時間の待ち・再開の段取り）。命令の実行が出した出来事は積んで続けて回し、入れ子にしない。
 * 作業中の様子（chat_live）は、回し終えたときに変わっていれば 1 回だけ配る（配るのは ChatRuns の publish 1 か所）
 */
export class RunShell {
  readonly runs: ChatRuns;
  /** 止まったあとの再開の段取り（runner.ts が殻を作ったあとで渡す） */
  recovery!: ChatRecovery;
  /** 1 回の実行に渡すもの（runner.ts が子チャットの作り方・予約の口を足して渡す） */
  turnDeps!: ExecutionDeps;
  /** アプリを終えるところ（待ちの列を送らない） */
  shuttingDown = false;
  /** 回している出来事の列（チャットごと） */
  private readonly queues = new Map<number, RunEvent[]>();
  /** 足した結果を待っている「いま」と、足せた「いま」（チャットごと） */
  private readonly tellWaits = new Map<number, Map<string, (result: "told" | "held") => void>>();
  private readonly told = new Map<number, Set<string>>();
  private readonly startedFns = new Set<(chatId: number) => void>();
  private readonly endedFns = new Set<(chatId: number, outcome: TurnOutcome) => void>();

  constructor(
    readonly deps: ShellDeps,
    private readonly hooks: ShellHooks,
  ) {
    this.runs = new ChatRuns({ store: deps.store, bus: deps.bus, clock: deps.clock, editTtlMs: deps.editHoldTtlMs, dispatch: (chatId, event) => this.dispatch(chatId, event) });
  }

  /**
   * 出来事を回す: 1 件ずつ step に渡して状態を書き（出す箱が変わったら保存）、命令を実行する。命令の実行が出した出来事は列に積んで続けて回す。
   * 回し終えたら、足した結果を待つ「いま」に答え、作業中の様子が変わっていれば 1 回だけ配る
   */
  dispatch(chatId: number, event: RunEvent): Dispatched {
    const queued = this.queues.get(chatId);
    if (queued) {
      queued.push(event);
      return { effects: [], started: [], queued: true };
    }
    const queue = [event];
    this.queues.set(chatId, queue);
    const run = this.runs.get(chatId);
    const before = JSON.stringify(liveOf(run));
    let first: Dispatched | null = null;
    try {
      for (let e = queue.shift(); e; e = queue.shift()) {
        const prev = run.run;
        const { state, effects } = step(prev, e, this.envOf(chatId, run));
        run.commit(state);
        // chats.status は段階の写し: 作業していないに戻ったら、最後に終わった実行の結果を書く（命令の前に。命令が出す出来事は書いたあとの状態で決める）
        if (prev.phase.kind !== "idle" && state.phase.kind === "idle" && run.endStatus !== null) {
          this.deps.store.chats.update(chatId, { status: run.endStatus });
          run.endStatus = null;
        }
        this.trace(chatId, e, prev, state, effects);
        const started: Promise<void>[] = [];
        for (const effect of effects) this.runEffect(chatId, run, effect, started);
        first ??= { effects, started };
      }
    } finally {
      this.queues.delete(chatId);
    }
    this.settleTells(chatId, run);
    if (JSON.stringify(liveOf(run)) !== before) run.changed();
    return first!;
  }

  /** 出来事を回し、断られたら失敗の種類の例外を投げる（答えを読むので、出来事を回している間 = 命令の実行の中からは呼ばない） */
  run(chatId: number, event: RunEvent): Dispatched {
    const done = this.dispatch(chatId, event);
    if (done.queued) throw new Error("出来事を回している間に、送る・送信待ちの窓口を呼びました");
    const rejected = done.effects.find((e) => e.do === "reject");
    if (rejected) throw rejection(rejected.status, rejected.message);
    return done;
  }

  /** 送るの答え（すぐ送ったなら、送る準備が済むまで待つ。いまの作業に足すところなら、足した結果を待つ） */
  async answer(chatId: number, done: Dispatched): Promise<TellResult["result"]> {
    const reply = done.effects.find((e) => e.do === "reply");
    await Promise.all(done.started);
    if (!reply || reply.result === "sent") return "sent";
    return reply.result === "pending" ? this.waitTell(chatId, reply.id!) : reply.result;
  }

  /** 出す箱に行を作るときの時刻と ID */
  outboxEnv(): OutboxEnv {
    return { now: this.deps.clock.iso(), newId: randomUUID };
  }

  /** step に渡す読むだけの入力（時刻と ID・会話があるか・引き継ぎの門・圧縮前指示） */
  private envOf(chatId: number, run: ChatRun): Env {
    const { store } = this.deps;
    const chat = store.chats.get(chatId);
    const pending = store.chatProviderHandoffs.get(chatId);
    const switched = pending ? store.events.get(pending.eventId) : undefined;
    return {
      ...this.outboxEnv(),
      shuttingDown: this.shuttingDown,
      hasSession: Boolean(chat?.session_id),
      hasTurnEndTasks: run.workplaceMove !== null,
      handoff: run.handoff()?.state ?? null,
      handoffQueued: switched?.type === "provider_switched" ? (switched.data.queued_ids ?? []) : [],
      preCompact: chat ? this.hooks.preCompactOf(chat.project_id) : null,
      preCompactSent: preCompactSent(run.marks),
      autoResumeOnReconnect: store.settings.get().auto_resume_on_reconnect,
      // 終わった実行の結果は、作業していないに戻るまで chats.status に書かないので、それを先に見る
      chatFailed: (run.endStatus ?? chat?.status) === "failed",
    };
  }

  /** 命令を 1 つ実行する（作業を動かす・いまの作業に足すは始めるだけで、終わりは出来事で戻る） */
  private runEffect(chatId: number, run: ChatRun, effect: Effect, started: Promise<void>[]) {
    const { store } = this.deps;
    if (effect.do === "start_turn") {
      const start = startTurn(this, chatId, run, effect);
      start.catch(() => {});
      started.push(start);
    } else if (effect.do === "tell") void tellItem(this, chatId, run, effect);
    else if (effect.do === "tell_pre_compact") {
      const uuid = randomUUID();
      const ok = Boolean(run.handle?.control?.tell(busyPreCompactMessage(effect.text), uuid));
      if (ok) recordEvent(store, run, { type: "user", text: effect.text, pre_compact: true, message_uuid: uuid });
      this.dispatch(chatId, { type: "pre_compact_told", ok });
    } else if (effect.do === "abort_turn") run.handle?.abort.abort();
    else if (effect.do === "clear_session") {
      // 自分で頼んだ: 止まったあとの再開の段取り（前の会話の続きを頼むもの）をやめる。コンテキストの大きさは、次の応答まで分からない。
      // ほかの AI に戻しても、消去前の会話を再開しない。新しい会話: 次に上限に近づいたら、また圧縮前指示を送る（消去の記録から導く preCompactSent）
      this.dispatch(chatId, { type: "forget_recovery" });
      store.chats.update(chatId, { session_id: null, context_tokens: null });
      store.chatProviderSessions.removeAll(chatId);
      recordEvent(store, run, { type: "context_cleared" });
    } else if (effect.do === "edit_timer") run.editTimer(effect.lane, effect.on, () => this.dispatch(chatId, { type: "edit_hold_expired", lane: effect.lane }));
    else if (effect.do === "record") {
      if (effect.kind === "error") store.events.add(chatId, { type: "error", message: effect.message });
      else recordEvent(store, run, { type: "notice", message: effect.message });
    } else if (effect.do === "watch" || effect.do === "ask_recovery" || effect.do === "withdraw_ask" || effect.do === "resume_recovery" || effect.do === "lookup_limit") this.recovery.run(chatId, effect);
    else if (effect.do === "resume_pending") store.chats.setResumePending([chatId], effect.value);
    else if (effect.do === "refresh_usage") this.deps.usage.refreshPolled();
    else if (effect.do === "run_turn_end_tasks" || effect.do === "drop_turn_end_tasks") this.hooks.turnEndTasks(chatId, run, effect);
  }

  /** 送った指示をすぐ動かす（同時に動かす数は決めない）。動かし始めたら turn_started、終わったら作業の終わりの見張りに知らせてから turn_ended を渡す */
  async execute(chatId: number, item: TurnRequest, turn: TurnKind, compactBy: CompactTrigger | null, pauseAfter = false) {
    const run = this.runs.get(chatId);
    const handle: TurnHandle = { abort: new AbortController(), control: null };
    run.setHandle(handle);
    if (this.deps.store.chats.get(chatId)?.status !== "running") this.deps.store.chats.update(chatId, { status: "running" });
    this.dispatch(chatId, { type: "turn_started", turn, compactBy, ...(pauseAfter ? { pauseAfter } : {}) });
    for (const fn of this.startedFns) fn(chatId);
    let outcome: TurnOutcome = { status: "failed", network: false };
    try {
      outcome = await executeTurn(this.turnDeps, run, item, handle.abort.signal);
    } finally {
      if (run.handle === handle) run.setHandle(null);
      run.endStatus = outcome.status;
      for (const fn of this.endedFns) fn(chatId, outcome);
      this.dispatch(chatId, { type: "turn_ended", outcome });
    }
  }

  /** 作業を動かし始めた・1 回の実行が終わった（作業の終わりにすることより前）を聞く（やめる関数を返す） */
  onTurnStarted(fn: (chatId: number) => void): () => void {
    this.startedFns.add(fn);
    return () => void this.startedFns.delete(fn);
  }

  onTurnEnded(fn: (chatId: number, outcome: TurnOutcome) => void): () => void {
    this.endedFns.add(fn);
    return () => void this.endedFns.delete(fn);
  }

  /** 足せた「いま」を覚える（足した結果を待っているものだけ） */
  markTold(chatId: number, id: string) {
    if (!this.tellWaits.get(chatId)?.has(id)) return;
    let told = this.told.get(chatId);
    if (!told) this.told.set(chatId, (told = new Set()));
    told.add(id);
  }

  /** 足した結果を待っている「いま」に答える（足せた told。足すところでなくなった = 預かった held） */
  private settleTells(chatId: number, run: ChatRun) {
    const waits = this.tellWaits.get(chatId);
    if (!waits) return;
    for (const [id, resolve] of waits) {
      if (this.told.get(chatId)?.delete(id)) resolve("told");
      else if (!isTellPending(run.run, id)) resolve("held");
      else continue;
      waits.delete(id);
    }
  }

  /** その「いま」を足した結果を待つ（足せた told・預かった held） */
  waitTell(chatId: number, id: string): Promise<"told" | "held"> {
    if (!isTellPending(this.runs.get(chatId).run, id)) return Promise.resolve("held");
    let waits = this.tellWaits.get(chatId);
    if (!waits) this.tellWaits.set(chatId, (waits = new Map()));
    const map = waits;
    return new Promise((resolve) => map.set(id, resolve));
  }

  /** チャットを消したとき: 足した結果を待っている「いま」は預かったことにして答え、作業中の状態を捨てる */
  forget(chatId: number) {
    for (const resolve of this.tellWaits.get(chatId)?.values() ?? []) resolve("held");
    this.tellWaits.delete(chatId);
    this.told.delete(chatId);
    this.runs.forget(chatId);
  }

  /** チャット（なければ 404） */
  requireChat(chatId: number): Chat {
    const chat = this.deps.store.chats.get(chatId);
    if (!chat) throw new NotFound("チャットが見つかりません");
    return chat;
  }

  /** 作業中か（段階が作業していないでなければ。まだ状態がなければ作業していない） */
  isBusy(chatId: number): boolean {
    const run = this.runs.peek(chatId);
    return run ? isBusy(run.run) : false;
  }

  /** 作業中（送る準備の途中も）なら 409。action は「削除」「分岐」などの、できない操作の名前 */
  requireIdle(chatId: number, action: string): void {
    if (this.isBusy(chatId)) throw new Conflict(`作業中のチャットは${action}できません。終わってから（または中断してから）行ってください`);
  }

  /** 出来事・変わった項目・命令を 1 行ずつ書く（trace の口があるときだけ） */
  private trace(chatId: number, event: RunEvent, prev: ChatRunState, next: ChatRunState, effects: Effect[]) {
    if (!this.deps.trace) return;
    const changed = (Object.keys(next) as (keyof ChatRunState)[]).filter((key) => JSON.stringify(prev[key]) !== JSON.stringify(next[key]));
    this.deps.trace(`chat ${chatId} ${event.type} → ${changed.join(",") || "-"} | ${effects.map((e) => e.do).join(",") || "-"}`);
  }
}
