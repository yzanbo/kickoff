import { randomUUID } from "node:crypto";
import { FollowupQueue } from "./followups.js";
import type { RunControl } from "./providers/types.js";
import { executeRun, type ExecutionDeps, type QueueItem, type RunOutcome } from "./runExecution.js";
import { RunnerQueue } from "./runnerQueue.js";
import { RunReconnect } from "./runReconnect.js";
import { RunUsageLimit } from "./runUsageLimit.js";
import { resolveRunDefaults } from "./runDefaults.js";
import { undeliveredReports, withUndeliveredReports } from "./reportHandover.js";
import { autoTitle, firstLine, promptWithAttachments } from "./runInput.js";
import type { Attachment, BackgroundState, ReconnectState, Run, RunOptions } from "./types.js";
import type { UsageMonitor } from "./usage.js";

interface StartRunInput {
  projectId: number;
  prompt: string;
  title?: string;
  options?: RunOptions;
  attachments?: Attachment[];
  /** 自分で作ったグループ（グループの＋から始めたとき） */
  groupId?: number;
  /** 作業場所（ワークツリーのフォルダ。省略なら本体） */
  worktreePath?: string;
}

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

  constructor(
    private readonly deps: ExecutionDeps & {
      usage: UsageMonitor;
      /** つながったかの確かめ方と間隔（テストで差し替える） */
      reconnect?: { check?: () => Promise<boolean>; intervalMs?: number };
      /** 使用枠が戻ったかを確かめる時計と間隔（テストで差し替える） */
      usageLimit?: { now?: () => number; checkMs?: number };
    },
  ) {
    super();
    this.followups = new FollowupQueue(
      (runId, queue, paused, stopAfter) => {
        const run = deps.store.getRun(runId);
        if (run) deps.bus?.publish({ type: "run_queue", project_id: run.project_id, run_id: runId, queue, paused, stop_after: stopAfter });
      },
      // 再起動しても残す（読み戻した列は止めておく）
      deps.store,
    );
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
    const { store, providers } = this.deps;
    const project = store.getProject(input.projectId);
    if (!project) throw new Error("プロジェクトが見つかりません");
    if (!providers[project.provider].implemented) throw new Error(`${providers[project.provider].label} はまだ使えません`);

    // チャット欄で指定がなければ、プロジェクトの既定 → アプリ全体の設定の順に使う
    const defaults = resolveRunDefaults(store.getSettings(), project.defaults);
    const options = input.options ?? {};
    const model = options.model ?? (project.provider === "claude" ? defaults.model || null : null);
    const run = store.createRun({
      project_id: project.id,
      provider: project.provider,
      title: input.title ?? firstLine(input.prompt),
      status: "queued",
      model,
      effort: options.effort === undefined ? defaults.effort : options.effort,
      permission_mode: options.permission_mode ?? defaults.permission,
      fast_mode: options.fast_mode ?? defaults.fastMode,
      group_id: input.groupId ?? null,
      worktree_path: input.worktreePath ?? "",
    });
    const attachments = input.attachments ?? [];
    // 発言の ID（Claude Code にも同じ ID で渡し、ファイルをこの発言の時点に戻すときの目印にする）
    const messageUuid = randomUUID();
    store.addEvent(run.id, { type: "user", text: input.prompt, ...(attachments.length ? { attachments } : {}), message_uuid: messageUuid });
    if (!input.title) void autoTitle(this.deps, run.id, input.prompt || attachments.map((a) => a.name).join("、"));
    this.enqueue({ runId: run.id, prompt: await promptWithAttachments(this.deps, input.prompt, attachments), promptId: messageUuid });
    return store.getRun(run.id)!;
  }

  /** 終了した会話に追加の指示を送り、続きから再開する */
  async send(runId: number, text: string, options: RunOptions = {}, attachments: Attachment[] = []): Promise<Run> {
    const { store } = this.deps;
    const run = store.getRun(runId);
    if (!run) throw new Error("実行が見つかりません");
    if (this.isBusy(runId)) throw new Error("エージェントが作業中です。終わってから送ってください");
    // 自分で送った: つながったら再開する・再開するかを聞くのをやめる（自動の再開から送ったときは続ける）
    this.forgetRecovery(runId);
    const { prompt, handover } = await this.prepare(runId, text, attachments);
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
    this.enqueue({ runId: run.id, prompt, promptId: messageUuid });
    return store.getRun(run.id)!;
  }

  /**
   * 続きの指示の下ごしらえ: 添付のパスと、親に届かなかったサブエージェントの報告を添える（前の作業が報告を受け取る前に
   * 終わっていたとき。送るまで残っている報告を、次の自然な機会に渡す）。handover は自分の発言の記録に足す
   */
  private async prepare(runId: number, text: string, attachments: Attachment[]) {
    const lost = undeliveredReports(this.deps.store.listEvents(runId));
    const prompt = withUndeliveredReports(await promptWithAttachments(this.deps, text, attachments), lost);
    return { prompt, handover: lost.length ? { handover: lost.map((s) => s.key) } : {} };
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
    const control = this.controls.get(runId);
    const { prompt, handover } = await this.prepare(runId, text, attachments);
    const messageUuid = randomUUID();
    if (control?.tell(prompt, messageUuid)) {
      // 自分で送った: つながったら再開する・再開するかを聞くのをやめる
      this.forgetRecovery(runId);
      store.addEvent(runId, { type: "user", text, ...(attachments.length ? { attachments } : {}), ...handover, message_uuid: messageUuid });
      if (run.attention) store.setRunAttention(runId, false);
      return "told";
    }
    const { id } = this.followups.add(runId, text, options, attachments);
    if (front) this.followups.move(runId, id, 0);
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
    this.active.get(runId)?.abort();
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
    return this.active.has(runId) || this.queue.some((q) => q.runId === runId);
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
