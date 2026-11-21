import { randomUUID } from "node:crypto";
import { executeTurn, takePendingNote, type ExecutionDeps, type TurnRequest } from "./turn";
import { RunnerQueue, type Dispatched } from "./runnerQueue";
import { outboxEnv, type ChatRuntime, type TurnHandle } from "./runtime";
import { liveOf } from "./live";
import { followupPrompt, nameOnFirstMessage } from "./input";
import { step } from "@/features/chat/core/run/machine/step";
import { isTellPending } from "@/features/chat/core/run/machine/state";
import type { Effect, Env, RunEvent, TurnKind, TurnOutcome } from "@/features/chat/core/run/machine/types";
import { recordEvent } from "@/features/chat/core/run/record";
import { preCompactSent } from "@/features/chat/core/run/machine/marks";
import type { ChatRecovery } from "@/features/chat/core/recovery/recovery";
import type { UsageMonitor } from "@/features/ai/core/index";
import type { CompactTrigger } from "@shared/ai/turnEvents";
import { errorMessage } from "@shared/foundation/errors";
import { busyPreCompactMessage, manualPreCompactMessage, postCompactMessage } from "@shared/chat/prompts";
import { marksOf } from "@shared/chat/handoff";

/**
 * Runner の殻の土台: 出来事を dispatch で 1 件ずつ純粋な step（run/machine/step.ts）に渡して状態を書き、返った命令を実行する
 * （作業を動かす・いまの作業に足す・記録・持ち時間の待ち・再開の段取り）。命令の実行が出した出来事は積んで続けて回し、入れ子にしない。
 * 上の機能の力が要る命令（作業の終わりにすること）と圧縮前指示は Runner が渡す
 */
export abstract class RunnerShell extends RunnerQueue {
  protected abstract readonly deps: ExecutionDeps & { usage: UsageMonitor };
  /** 1 回の実行に渡すもの */
  protected abstract readonly turnDeps: ExecutionDeps;
  /** 通信の切断・使用枠の上限で止まったあとの再開の段取り */
  protected abstract readonly recovery: ChatRecovery;
  /** アプリを終えるところ（待ちの列を送らない） */
  protected shuttingDown = false;
  /** 回している出来事の列（チャットごと。命令の実行が出した出来事は積み、入れ子にしない） */
  private readonly queues = new Map<number, RunEvent[]>();
  /** 足した結果を待っている「いま」と、足せた「いま」（チャットごと） */
  protected readonly tellWaits = new Map<number, Map<string, (result: "told" | "held") => void>>();
  protected readonly told = new Map<number, Set<string>>();

  /** そのプロジェクトで送る圧縮前指示（なければ null） */
  protected abstract preCompactOf(projectId: number): string | null;
  /** 作業の終わりにすること（AI が予約した作業場所の移動）を行う・予約を消す（行ったら settled を渡す） */
  protected abstract turnEndTasks(chatId: number, runtime: ChatRuntime, effect: Extract<Effect, { do: "run_turn_end_tasks" | "drop_turn_end_tasks" }>): void;

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
    const runtime = this.runtimes.get(chatId);
    const before = JSON.stringify(liveOf(runtime));
    let first: Dispatched | null = null;
    try {
      for (let e = queue.shift(); e; e = queue.shift()) {
        const { state, effects } = step(runtime.run, e, this.envOf(chatId, runtime));
        runtime.commit(state);
        const started: Promise<void>[] = [];
        for (const effect of effects) this.runEffect(chatId, runtime, effect, started);
        first ??= { effects, started };
      }
    } finally {
      this.queues.delete(chatId);
    }
    this.settleTells(chatId, runtime);
    if (JSON.stringify(liveOf(runtime)) !== before) runtime.changed();
    return first!;
  }

  /** step に渡す読むだけの入力（時刻と ID・会話があるか・引き継ぎの門・圧縮前指示） */
  private envOf(chatId: number, runtime: ChatRuntime): Env {
    const { store } = this.deps;
    const chat = store.chats.get(chatId);
    const pending = store.chatProviderHandoffs.get(chatId);
    const switched = pending ? store.events.get(pending.eventId) : undefined;
    return {
      ...outboxEnv(),
      shuttingDown: this.shuttingDown,
      hasSession: Boolean(chat?.session_id),
      hasTurnEndTasks: runtime.workplaceMove !== null,
      handoff: runtime.handoff()?.state ?? null,
      handoffQueued: switched?.type === "provider_switched" ? (switched.data.queued_ids ?? []) : [],
      preCompact: chat ? this.preCompactOf(chat.project_id) : null,
      preCompactSent: preCompactSent(runtime.marks),
      autoResumeOnReconnect: store.settings.get().auto_resume_on_reconnect,
      chatFailed: chat?.status === "failed",
    };
  }

  /** 命令を 1 つ実行する（作業を動かす・いまの作業に足すは始めるだけで、終わりは出来事で戻る） */
  private runEffect(chatId: number, runtime: ChatRuntime, effect: Effect, started: Promise<void>[]) {
    const { store } = this.deps;
    if (effect.do === "start_turn") {
      const start = this.startTurn(chatId, runtime, effect);
      start.catch(() => {});
      started.push(start);
    } else if (effect.do === "tell") void this.tellItem(chatId, runtime, effect);
    else if (effect.do === "tell_pre_compact") {
      const uuid = randomUUID();
      const ok = Boolean(runtime.handle?.control?.tell(busyPreCompactMessage(effect.text), uuid));
      if (ok) recordEvent(store, runtime, { type: "user", text: effect.text, pre_compact: true, message_uuid: uuid });
      this.dispatch(chatId, { type: "pre_compact_told", ok });
    } else if (effect.do === "abort_turn") runtime.handle?.abort.abort();
    else if (effect.do === "clear_session") {
      // 自分で頼んだ: 止まったあとの再開の段取り（前の会話の続きを頼むもの）をやめる。コンテキストの大きさは、次の応答まで分からない。
      // ほかの AI に戻しても、消去前の会話を再開しない。新しい会話: 次に上限に近づいたら、また圧縮前指示を送る（消去の記録から導く preCompactSent）
      this.dispatch(chatId, { type: "forget_recovery" });
      store.chats.update(chatId, { session_id: null, context_tokens: null });
      store.chatProviderSessions.removeAll(chatId);
      recordEvent(store, runtime, { type: "context_cleared" });
    } else if (effect.do === "edit_timer") runtime.editTimer(effect.lane, effect.on, () => this.dispatch(chatId, { type: "edit_hold_expired", lane: effect.lane }));
    else if (effect.do === "record") {
      if (effect.kind === "error") store.events.add(chatId, { type: "error", message: effect.message });
      else recordEvent(store, runtime, { type: "notice", message: effect.message });
    } else if (effect.do === "watch" || effect.do === "ask_recovery" || effect.do === "withdraw_ask" || effect.do === "resume_recovery" || effect.do === "lookup_limit") this.recovery.run(chatId, effect);
    else if (effect.do === "resume_pending") store.chats.setResumePending([chatId], effect.value);
    else if (effect.do === "refresh_usage") this.deps.usage.refreshPolled();
    else if (effect.do === "run_turn_end_tasks" || effect.do === "drop_turn_end_tasks") this.turnEndTasks(chatId, runtime, effect);
  }

  /** 作業を動かす（指示なら文を組み立てて発言を記録してから。組み立てられなければ送信待ちの次へ進み、送った所に理由を返す・残す） */
  private async startTurn(chatId: number, runtime: ChatRuntime, effect: Extract<Effect, { do: "start_turn" }>): Promise<void> {
    const { store } = this.deps;
    if (effect.turn === "compact" || effect.turn === "pre_compact") {
      store.chats.update(chatId, { status: "running", error: null });
      if (effect.turn === "compact") return void this.execute(chatId, { chatId, prompt: "/compact", compact: true, ...(effect.trigger ? { compactTrigger: effect.trigger } : {}) }, "compact", effect.trigger ?? "manual");
      // この指示の作業の途中で自動の圧縮が来ても、もう足さない（記録から導く preCompactSent）。圧縮が終わるまで「いま」は預かる
      const messageUuid = randomUUID();
      recordEvent(store, runtime, { type: "user", text: effect.text!, pre_compact: true, message_uuid: messageUuid });
      return void this.execute(chatId, { chatId, prompt: manualPreCompactMessage(effect.text!), promptId: messageUuid }, "pre_compact", "manual");
    }
    const m = effect.item!;
    const post = effect.turn === "post_compact";
    let prepared: Awaited<ReturnType<typeof followupPrompt>>;
    try {
      prepared = await followupPrompt(this.deps, chatId, post ? postCompactMessage(m.text) : m.text, m.attachments);
    } catch (e) {
      // 送れなかった間に届いた指示（待ちの列）は取り残さない
      this.dispatch(chatId, { type: "prepared", next: "send_next" });
      if (effect.from !== "user") store.events.add(chatId, { type: "error", message: `${effect.from === "queue" ? "待ちの指示を送れませんでした" : "圧縮のあとに指示を送れませんでした"}: ${errorMessage(e)}` });
      throw e;
    }
    // 自分で送った: つながったら再開する・再開するかを聞くのをやめる（自動の再開から送ったときは続ける）。起動したときの再開の確かめで、作業を続けるかも聞かない
    this.dispatch(chatId, { type: "forget_recovery" });
    this.dispatch(chatId, { type: "forget_interrupted" });
    const messageUuid = randomUUID();
    // 聞かずに開いた子チャット（名前も発言もない）は、最初に送った文から名前を付ける
    if (!post) nameOnFirstMessage(this.deps, chatId, m.text, m.attachments);
    recordEvent(store, runtime, { type: "user", text: m.text, ...(m.attachments.length ? { attachments: m.attachments } : {}), ...prepared.handover, ...(post ? { post_compact: true } : {}), ...marksOf(m), message_uuid: messageUuid });
    // チャット欄でモデルや権限モードを変えた場合は、この続きから反映する
    store.chats.update(chatId, { status: "running", error: null, unread: false, ...m.options });
    void this.execute(chatId, { chatId, prompt: prepared.prompt, promptId: messageUuid }, effect.turn, null, effect.pauseAfter);
  }

  /** 送った指示をすぐ動かす（同時に動かす数は決めない）。動かし始めたら turn_started、終わったら turn_ended を渡す */
  protected async execute(chatId: number, item: TurnRequest, turn: TurnKind, compactBy: CompactTrigger | null, pauseAfter = false) {
    const runtime = this.runtimes.get(chatId);
    const handle: TurnHandle = { abort: new AbortController(), control: null };
    runtime.setHandle(handle);
    this.dispatch(chatId, { type: "turn_started", turn, compactBy, ...(pauseAfter ? { pauseAfter } : {}) });
    let outcome: TurnOutcome = { status: "failed", network: false };
    try {
      outcome = await executeTurn(this.turnDeps, runtime, item, handle.abort.signal);
    } finally {
      if (runtime.handle === handle) runtime.setHandle(null);
      this.dispatch(chatId, { type: "turn_ended", outcome });
    }
  }

  /**
   * いまの作業に「いま」を足す（文を組み立ててから。組み立てている間に作業が終わった・足せなくなった・次の命令が出たら足さない = 行は預かりに残る）。
   * まだ AI に伝えていない Kickoff からの知らせ（作業場所を移す予約の取り消しなど）があれば、頭に一度だけ添える
   */
  private async tellItem(chatId: number, runtime: ChatRuntime, { turnId, item }: Extract<Effect, { do: "tell" }>) {
    const { store } = this.deps;
    const seq = ++runtime.tellSeq;
    const post = item.post_compact === true;
    const stale = () => {
      const { phase } = runtime.run;
      return seq !== runtime.tellSeq || phase.kind !== "turn" || phase.id !== turnId || phase.telling !== item.id;
    };
    let prepared: Awaited<ReturnType<typeof followupPrompt>>;
    try {
      prepared = await followupPrompt(this.deps, chatId, post ? postCompactMessage(item.text) : item.text, item.attachments);
    } catch (e) {
      if (stale()) return;
      store.events.add(chatId, { type: "error", message: `圧縮のあとに指示を伝えられませんでした: ${errorMessage(e)}` });
      return void this.dispatch(chatId, { type: "tell_result", id: item.id, ok: false, drop: true });
    }
    if (stale()) return;
    const messageUuid = randomUUID();
    const note = post ? null : runtime.pendingNote;
    const ok = Boolean(runtime.handle?.control?.tell(note ? `${note}\n\n${prepared.prompt}` : prepared.prompt, messageUuid));
    if (ok) {
      if (note && runtime.pendingNote === note) takePendingNote(runtime);
      // 自分で送った: つながったら再開する・再開するかを聞くのをやめる（起動したときの再開の確かめで、作業を続けるかも聞かない）
      if (!post) {
        this.dispatch(chatId, { type: "forget_recovery" });
        this.dispatch(chatId, { type: "forget_interrupted" });
      }
      recordEvent(store, runtime, { type: "user", text: item.text, ...(item.attachments.length ? { attachments: item.attachments } : {}), ...prepared.handover, ...(post ? { post_compact: true } : {}), ...marksOf(item), message_uuid: messageUuid });
      if (!post && store.chats.get(chatId)?.unread) store.chats.setUnread(chatId, false);
      if (this.tellWaits.get(chatId)?.has(item.id)) this.toldOf(chatId).add(item.id);
    }
    this.dispatch(chatId, { type: "tell_result", id: item.id, ok });
  }

  private toldOf(chatId: number): Set<string> {
    let told = this.told.get(chatId);
    if (!told) this.told.set(chatId, (told = new Set()));
    return told;
  }

  /** 足した結果を待っている「いま」に答える（足せた told。足すところでなくなった = 預かった held） */
  private settleTells(chatId: number, runtime: ChatRuntime) {
    const waits = this.tellWaits.get(chatId);
    if (!waits) return;
    for (const [id, resolve] of waits) {
      if (this.told.get(chatId)?.delete(id)) resolve("told");
      else if (!isTellPending(runtime.run, id)) resolve("held");
      else continue;
      waits.delete(id);
    }
  }

  protected waitTell(chatId: number, id: string): Promise<"told" | "held"> {
    if (!isTellPending(this.runtimes.get(chatId).run, id)) return Promise.resolve("held");
    let waits = this.tellWaits.get(chatId);
    if (!waits) this.tellWaits.set(chatId, (waits = new Map()));
    const map = waits;
    return new Promise((resolve) => map.set(id, resolve));
  }
}
