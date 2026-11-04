import { randomUUID } from "node:crypto";
import { FollowupQueue } from "./followups.js";
import { QueueEditHolds } from "./queueEditHolds.js";
import type { RunControl } from "./providers/types.js";
import { executeRun, type ExecutionDeps, type QueueItem, type RunOutcome } from "./runExecution.js";
import { RunnerQueue } from "./runnerQueue.js";
import { RunReconnect } from "./runReconnect.js";
import { RunStopping } from "./runStopping.js";
import { RunUsageLimit } from "./runUsageLimit.js";
import { createRun, followupPrompt, type StartRunInput } from "./runInput.js";
import type { Attachment, BackgroundState, ReconnectState, Run, RunOptions } from "./types.js";
import type { UsageMonitor } from "./usage.js";

/**
 * エージェントの実行を管理する。
 * 同時実行数の上限を超えた分は待機列に入れ、空きができしだい順に開始する。
 * 1 つの実行（Run）は 1 つの会話で、追加のメッセージを送ると同じセッションを続きから再開する。
 * 作業中のチャットに送った次の指示は、チャットごとの待ちの列（followups）に入れ、作業が終わったら（止めた・失敗したときも）順に送る。
 * 1 回の実行の中身（作業場所・プロバイダーの呼び出し・結果の反映）は runExecution.ts、
 * 通信が切れて止まったときの再開の段取り（送信待ちを止める・つながったら再開・何度も止まったら聞く）は runReconnect.ts
 */
export class Runner extends RunnerQueue {
  private readonly active = new Map<number, AbortController>();
  private readonly queue: QueueItem[] = [];
  protected readonly followups: FollowupQueue;
  protected readonly editHolds: QueueEditHolds;
  /** アプリを終えるところ（待ちの列を送らない） */
  private shuttingDown = false;

  /** 通信が切れて止まったチャットの再開 */
  private readonly reconnect: RunReconnect;
  /** 使用枠の上限で止まったときの段取り（送信待ちを止め、枠が戻ったら続けるかを聞く。runUsageLimit.ts） */
  private readonly usageLimit: RunUsageLimit;
  /** 作業中のチャットの、裏で動いている作業の様子（executeRun が書き、詳細の API で返す） */
  private readonly background = new Map<number, BackgroundState>();
  /** 作業中のチャットへの操作（止めずに発言を足す・裏の作業を止める。プロバイダーが渡す） */
  private readonly controls = new Map<number, RunControl>();
  /** 止めるよう頼んで、終わるのを待っているチャット（runStopping.ts） */
  private readonly stopping: RunStopping;
  /**
   * 送る準備をしているチャット（send で作業中かを確かめてから、指示を組み立てて順番待ちに入れるまで）。作業中として数える。
   * 組み立ての間（await）に別の送信（送信待ちの自動送信と「いま」など）が割り込むと、同じチャットを 2 つ同時に動かし、片方の指示が会話から消えていた
   */
  private readonly preparing = new Set<number>();

  constructor(
    private readonly deps: ExecutionDeps & {
      usage: UsageMonitor;
      /** つながったかの確かめ方と間隔（テストで差し替える） */
      reconnect?: { check?: () => Promise<boolean>; intervalMs?: number };
      /** 使用枠が戻ったかを確かめる時計と間隔（テストで差し替える） */
      usageLimit?: { now?: () => number; checkMs?: number };
      /** 書き直している印の持ち時間（テストで差し替える） */
      editHoldTtlMs?: number;
    },
  ) {
    super();
    this.stopping = new RunStopping(deps);
    this.followups = new FollowupQueue(
      (runId) => this.queueChanged(runId),
      // 再起動しても残す（読み戻した列は止めておく）
      deps.store,
    );
    this.editHolds = new QueueEditHolds((runId) => this.editHoldsChanged(runId), deps.editHoldTtlMs);
    this.reconnect = new RunReconnect({
      store: deps.store,
      approvals: deps.approvals,
      bus: deps.bus,
      followups: this.followups,
      isBusy: (runId) => this.isBusy(runId),
      send: (runId, text) => this.send(runId, text),
      ...deps.reconnect,
    });
    this.usageLimit = new RunUsageLimit({
      store: deps.store,
      approvals: deps.approvals,
      followups: this.followups,
      isBusy: (runId) => this.isBusy(runId),
      send: (runId, text) => this.send(runId, text),
      usage: deps.usage,
      ...deps.usageLimit,
    });
  }

  /** 待ちの列の様子を画面に配る（列・止めておくか・一時停止の位置・書き直しを待っているか） */
  protected queueChanged(runId: number) {
    const run = this.deps.store.getRun(runId);
    if (!run) return;
    this.deps.bus?.publish({
      type: "run_queue",
      project_id: run.project_id,
      run_id: runId,
      queue: this.followups.list(runId),
      paused: this.followups.isPaused(runId),
      stops: this.followups.stopsOf(runId),
      waiting_edit: this.queueWaitingForEdit(runId),
    });
  }

  /** 裏で動いている作業の様子（作業中でなければ null） */
  backgroundState(runId: number): BackgroundState | null {
    return this.background.get(runId) ?? null;
  }

  /** つながったら自動で再開するのを待っているか（null なら待っていない） */
  reconnectState(runId: number): ReconnectState | null {
    return this.reconnect.state(runId);
  }

  /** つながったら自動で再開するのをやめる（待っていたら true） */
  stopReconnect(runId: number): boolean {
    return this.reconnect.stopWaiting(runId);
  }

  async start(input: StartRunInput): Promise<Run> {
    const { run, prompt, messageUuid } = await createRun(this.deps, input);
    this.enqueue({ runId: run.id, prompt, promptId: messageUuid });
    return this.deps.store.getRun(run.id)!;
  }

  /** 終了した会話に追加の指示を送り、続きから再開する */
  async send(runId: number, text: string, options: RunOptions = {}, attachments: Attachment[] = []): Promise<Run> {
    const { store } = this.deps;
    const run = store.getRun(runId);
    if (!run) throw new Error("実行が見つかりません");
    if (this.isBusy(runId)) throw new Error("エージェントが作業中です。終わってから送ってください");
    // 順番待ちに入れるまで作業中として数える（組み立ての間に届いた送信は、作業中のチャットへの送信として扱われる）
    this.preparing.add(runId);
    let prepared: Awaited<ReturnType<typeof followupPrompt>>;
    try {
      prepared = await followupPrompt(this.deps, runId, text, attachments);
    } catch (e) {
      this.preparing.delete(runId);
      // 送れなかった間に届いた指示（待ちの列）は取り残さない
      void this.sendNextQueued(runId);
      throw e;
    }
    // 自分で送った: つながったら再開する・再開するかを聞くのをやめる（自動の再開から送ったときは続ける）
    this.forgetRecovery(runId);
    const { prompt, handover } = prepared;
    const messageUuid = randomUUID();
    store.addEvent(run.id, { type: "user", text, ...(attachments.length ? { attachments } : {}), ...handover, message_uuid: messageUuid });
    // チャット欄でモデルや権限モードを変えた場合は、この続きから反映する
    store.updateRun(run.id, {
      status: "queued",
      error: null,
      attention: false,
      model: options.model === undefined ? undefined : options.model,
      effort: options.effort === undefined ? undefined : options.effort,
      permission_mode: options.permission_mode ?? undefined,
      fast_mode: options.fast_mode ?? undefined,
    });
    // 順番待ちに入れたら作業中（this.queue / this.active）として数えられるので、準備の印は外す
    this.preparing.delete(runId);
    this.enqueue({ runId: run.id, prompt, promptId: messageUuid });
    return store.getRun(run.id)!;
  }

  /**
   * 止めずに伝える: 作業中なら、いまのやり取りに発言を足す（メインのエージェントが、いまの手順の切れ目で読む。
   * 裏のサブエージェント・コマンドは動き続ける）。足せないとき（順番待ち・要約中など）は待ちの列に入れ（front なら先頭）、
   * 作業中でなければすぐ送る。モデルなどの選択は、作業の途中では変えられないので次に送るときから効く
   */
  async tell(runId: number, text: string, options: RunOptions = {}, attachments: Attachment[] = [], { front = false } = {}): Promise<"told" | "sent" | "queued"> {
    const { store } = this.deps;
    const run = store.getRun(runId);
    if (!run) throw new Error("実行が見つかりません");
    if (!this.isBusy(runId)) {
      await this.send(runId, text, options, attachments);
      return "sent";
    }
    const { prompt, handover } = await followupPrompt(this.deps, runId, text, attachments);
    const messageUuid = randomUUID();
    // 組み立てている間に始まった・終わった実行もあるので、足し先は組み立てたあとに取り直す
    const control = this.controls.get(runId);
    if (control?.tell(prompt, messageUuid)) {
      // 自分で送った: つながったら再開する・再開するかを聞くのをやめる
      this.forgetRecovery(runId);
      store.addEvent(runId, { type: "user", text, ...(attachments.length ? { attachments } : {}), ...handover, message_uuid: messageUuid });
      if (run.attention) store.setRunAttention(runId, false);
      return "told";
    }
    const { id } = this.followups.add(runId, text, options, attachments);
    if (front) this.followups.move(runId, id, 0);
    // 組み立てている間に作業が終わっていたら、終わったときの自動送信はもう済んでいるので、ここで送る（列に取り残さない）
    if (!this.isBusy(runId)) void this.sendNextQueued(runId);
    return "queued";
  }

  /** 裏で動いている作業を 1 つ止める（サブエージェント・コマンド。作業中でなければ false） */
  async stopBackgroundTask(runId: number, taskId: string): Promise<boolean> {
    const control = this.controls.get(runId);
    if (!control) return false;
    await control.stopTask(taskId);
    return true;
  }

  /** チャットを消したとき、待ちの列も消す */
  forgetQueued(runId: number) {
    this.followups.forget(runId);
    this.editHolds.forget(runId);
    this.waitingForEdit.delete(runId);
    this.forgetRecovery(runId);
  }

  /** 自分で送った・チャットを消した: 通信・使用枠の上限で止まったあとの再開の段取り（待つ・聞く）をやめる */
  private forgetRecovery(runId: number) {
    this.reconnect.forget(runId);
    this.usageLimit.forget(runId);
  }

  /**
   * 会話を要約して、コンテキストを空ける（Claude Code の /compact を手で実行する）。
   * 会話の記録には発言として残さず、要約したこと（compact イベント）だけが残る。終わっても未読にしない
   */
  async compact(runId: number): Promise<Run> {
    const { store } = this.deps;
    const run = store.getRun(runId);
    if (!run) throw new Error("実行が見つかりません");
    if (this.isBusy(runId)) throw new Error("エージェントが作業中です。終わってから圧縮してください");
    if (!run.session_id) throw new Error("まだ会話がないので、圧縮できません");
    store.updateRun(run.id, { status: "queued", error: null });
    this.enqueue({ runId: run.id, prompt: "/compact", compact: true });
    return store.getRun(run.id)!;
  }


  cancel(runId: number) {
    const queued = this.queue.findIndex((q) => q.runId === runId);
    if (queued >= 0) {
      this.queue.splice(queued, 1);
      this.deps.store.updateRun(runId, { status: "cancelled" });
      return;
    }
    const controller = this.active.get(runId);
    if (!controller) return;
    this.stopping.begin(runId);
    controller.abort();
  }

  /** 止めるよう頼んで、終わるのを待っているところか */
  isStopping(runId: number): boolean {
    return this.stopping.has(runId);
  }

  /** 実行中・順番待ちのエージェントの数（接続の詳細の表示用） */
  stats(): { running: number; queued: number } {
    return { running: this.active.size, queued: this.queue.length };
  }

  protected hasRun(runId: number): boolean {
    return this.deps.store.getRun(runId) !== undefined;
  }

  protected reportError(runId: number, message: string) {
    this.deps.store.addEvent(runId, { type: "error", message });
  }

  isBusy(runId: number): boolean {
    return this.active.has(runId) || this.preparing.has(runId) || this.queue.some((q) => q.runId === runId);
  }

  /** アプリ終了時: 実行中のエージェントをすべて止める */
  shutdown() {
    this.shuttingDown = true;
    this.reconnect.shutdown();
    this.usageLimit.shutdown();
    this.queue.length = 0;
    for (const controller of this.active.values()) controller.abort();
  }

  private enqueue(item: QueueItem) {
    this.queue.push(item);
    this.pump();
  }

  private pump() {
    // 上限なし（null）なら、待たせずにすべて動かす
    const limit = this.deps.store.getSettings().maxConcurrentRuns ?? Infinity;
    while (this.active.size < limit && this.queue.length > 0) {
      const item = this.queue.shift()!;
      void this.execute(item);
    }
  }

  private async execute(item: QueueItem) {
    const controller = new AbortController();
    this.active.set(item.runId, controller);
    let outcome: RunOutcome = { status: "failed", network: false };
    try {
      outcome = await executeRun({ ...this.deps, background: this.background, controls: this.controls }, item, controller.signal);
    } finally {
      this.active.delete(item.runId);
      this.stopping.end(item.runId);
      void this.deps.usage.refresh();
      // 終わったら、待ちの列の次の指示を送る（完了でも、止めた・失敗したときでも送る。アプリを終えるときは送らない）。
      // 通信が切れた・使用枠の上限で止まったときは送らず、つながる・枠が戻るのを待つ（送っても失敗して消えるため）
      const network = this.reconnect.finished(item.runId, outcome);
      const usage = this.usageLimit.finished(item.runId, outcome);
      if (!this.shuttingDown && network && usage) void this.sendNextQueued(item.runId);
      this.pump();
    }
  }
}
