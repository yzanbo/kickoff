import { errorMessage } from "./errors.js";
import { FollowupQueue } from "./followups.js";
import type { RunControl } from "./providers/types.js";
import { executeRun, type ExecutionDeps, type QueueItem, type RunOutcome } from "./runExecution.js";
import { RunReconnect } from "./runReconnect.js";
import { resolveRunDefaults } from "./runDefaults.js";
import { undeliveredReports, withUndeliveredReports } from "./reportHandover.js";
import { autoTitle, firstLine, promptWithAttachments } from "./runInput.js";
import type { Attachment, BackgroundState, QueuedMessage, ReconnectState, Run, RunOptions } from "./types.js";
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
export class Runner {
  private readonly active = new Map<number, AbortController>();
  private readonly queue: QueueItem[] = [];
  private readonly followups: FollowupQueue;
  /** アプリを終えるところ（待ちの列を送らない） */
  private shuttingDown = false;

  /** 通信が切れて止まったチャットの再開 */
  private readonly reconnect: RunReconnect;
  /** 作業中のチャットの、裏で動いている作業の様子（executeRun が書き、詳細の API で返す） */
  private readonly background = new Map<number, BackgroundState>();
  /** 作業中のチャットへの操作（止めずに発言を足す・裏の作業を止める。プロバイダーが渡す） */
  private readonly controls = new Map<number, RunControl>();

  constructor(
    private readonly deps: ExecutionDeps & {
      usage: UsageMonitor;
      /** つながったかの確かめ方と間隔（テストで差し替える） */
      reconnect?: { check?: () => Promise<boolean>; intervalMs?: number };
    },
  ) {
    this.followups = new FollowupQueue((runId, queue, paused, stopAfter) => {
      const run = deps.store.getRun(runId);
      if (run) deps.bus?.publish({ type: "run_queue", project_id: run.project_id, run_id: runId, queue, paused, stop_after: stopAfter });
    });
    this.reconnect = new RunReconnect({
      store: deps.store,
      approvals: deps.approvals,
      bus: deps.bus,
      followups: this.followups,
      isBusy: (runId) => this.isBusy(runId),
      send: (runId, text) => this.send(runId, text),
      ...deps.reconnect,
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
    store.addEvent(run.id, { type: "user", text: input.prompt, ...(attachments.length ? { attachments } : {}) });
    if (!input.title) void autoTitle(this.deps, run.id, input.prompt || attachments.map((a) => a.name).join("、"));
    this.enqueue({ runId: run.id, prompt: await promptWithAttachments(this.deps, input.prompt, attachments) });
    return store.getRun(run.id)!;
  }

  /** 終了した会話に追加の指示を送り、続きから再開する */
  async send(runId: number, text: string, options: RunOptions = {}, attachments: Attachment[] = []): Promise<Run> {
    const { store } = this.deps;
    const run = store.getRun(runId);
    if (!run) throw new Error("実行が見つかりません");
    if (this.isBusy(runId)) throw new Error("エージェントが作業中です。終わってから送ってください");
    // 自分で送った: つながったら再開する・再開するかを聞くのをやめる（自動の再開から送ったときは続ける）
    this.reconnect.forget(runId);
    const { prompt, handover } = await this.prepare(runId, text, attachments);
    store.addEvent(run.id, { type: "user", text, ...(attachments.length ? { attachments } : {}), ...handover });
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
    this.enqueue({ runId: run.id, prompt });
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

  /** 作業中のチャットの次の指示の待ちの列 */
  queued(runId: number): QueuedMessage[] {
    return this.followups.list(runId);
  }

  /**
   * 次の指示を送る。作業中なら待ちの列に入れ（終わったら順に送る）、作業中でなければすぐ送る。
   * queued: 列に入れたか、id: 列に入れたその指示の ID
   */
  async queueMessage(runId: number, text: string, options: RunOptions = {}, attachments: Attachment[] = []): Promise<{ queued: boolean; id?: string }> {
    if (!this.deps.store.getRun(runId)) throw new Error("実行が見つかりません");
    if (!this.isBusy(runId)) {
      await this.send(runId, text, options, attachments);
      return { queued: false };
    }
    const { id } = this.followups.add(runId, text, options, attachments);
    return { queued: true, id };
  }

  /** 待ちの列から消す（なければ false） */
  removeQueued = (runId: number, id: string): boolean => this.followups.remove(runId, id);

  /** 待ちの指示の文を書き換える（なければ false。文も添付もなくなるなら断る） */
  /** 待ちの指示を書き直す（attachments があれば添付も置き換える。文も添付もなくなるなら断る） */
  editQueued(runId: number, id: string, text: string, attachments?: Attachment[]): boolean {
    const message = this.followups.list(runId).find((m) => m.id === id);
    if (!message) return false;
    const nextAttachments = attachments ?? message.attachments;
    if (!text.trim() && nextAttachments.length === 0) throw new Error("メッセージか添付ファイルが必要です");
    return this.followups.edit(runId, id, text.trim(), nextAttachments);
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
    if (control?.tell(prompt)) {
      // 自分で送った: つながったら再開する・再開するかを聞くのをやめる
      this.reconnect.forget(runId);
      store.addEvent(runId, { type: "user", text, ...(attachments.length ? { attachments } : {}), ...handover });
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

  /** 待ちの指示をすべて消す（消した数を返す） */
  clearQueued = (runId: number): number => this.followups.clear(runId);

  /** 待ちの指示をいくつかまとめて消す・いちばん上か下へまとめて移す（扱った数を返す） */
  removeQueuedMany = (runId: number, ids: string[]): number => this.followups.removeMany(runId, ids);
  moveQueuedMany = (runId: number, ids: string[], to: "top" | "bottom" | { before: string | null }): number => this.followups.moveMany(runId, ids, to);

  /** 待ちの列を並べ替える（なければ false） */
  moveQueued(runId: number, id: string, index: number): boolean {
    return this.followups.move(runId, id, index);
  }

  /**
   * 待ちの 1 件をすぐ送る。作業中なら止めずに伝え、伝えられなければ列の先頭に戻す（なければ false）
   */
  async sendQueuedNow(runId: number, id: string): Promise<boolean> {
    const message = this.followups.take(runId, id);
    if (!message) return false;
    await this.tell(runId, message.text, message.options, message.attachments, { front: true });
    return true;
  }

  /**
   * 待ちの指示をすべて（ids を渡せばその指示だけ）1 つにまとめて、すぐ送る（作業中なら止めずに伝える）。送るものがなければ false
   */
  async sendAllQueued(runId: number, ids?: string[]): Promise<boolean> {
    // 1 つにまとめた指示を列から取り出して送る（列に「まとめた 1 件」を一瞬出さない）
    const merged = this.followups.merge(runId, { silent: true, ids });
    if (!merged) return false;
    return this.sendQueuedNow(runId, merged.id);
  }

  /** 「ここまで自動で送る」の印を付けた待ちの指示（なければ null） */
  queueStopAfter(runId: number): string | null {
    return this.followups.stopAfterOf(runId);
  }

  /** 「ここまで自動で送る」の印を付ける・外す（その指示を送ったら止めておく。id が列になければ false） */
  setQueueStopAfter(runId: number, id: string | null): boolean {
    return this.followups.setStopAfter(runId, id);
  }

  /** 待ちの列を、いまの作業が終わっても自動で送らずに止めておくか */
  queuePaused(runId: number): boolean {
    return this.followups.isPaused(runId);
  }

  /**
   * 待ちの列を止めておくかを切り替える（列が空なら止めない）。自動で送るに戻したとき、作業中でなければ先頭をすぐ送る。
   * 止めておくかを返す
   */
  async setQueuePaused(runId: number, paused: boolean): Promise<boolean> {
    const next = this.followups.setPaused(runId, paused);
    if (!next && !this.isBusy(runId)) await this.sendNextQueued(runId);
    return next;
  }

  /** チャットを消したとき、待ちの列も消す */
  forgetQueued(runId: number) {
    this.followups.forget(runId);
    this.reconnect.forget(runId);
  }

  /** 待ちの列の先頭を送る（送れなければ、理由をチャットに残す） */
  private async sendNextQueued(runId: number) {
    // 止めておくチャットは、終わっても送らない（行の「すぐ送る」で 1 件ずつ送る）
    if (this.followups.isPaused(runId)) return;
    const next = this.followups.take(runId);
    if (!next) return;
    try {
      await this.send(runId, next.text, next.options, next.attachments);
    } catch (e) {
      this.deps.store.addEvent(runId, { type: "error", message: `待ちの指示を送れませんでした: ${errorMessage(e)}` });
    }
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

  isBusy(runId: number): boolean {
    return this.active.has(runId) || this.queue.some((q) => q.runId === runId);
  }

  /** アプリ終了時: 実行中のエージェントをすべて止める */
  shutdown() {
    this.shuttingDown = true;
    this.reconnect.shutdown();
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
      // 通信が切れて止まったときは送らず、つながるのを待つ（送っても失敗して消えるため）
      if (!this.shuttingDown && this.reconnect.finished(item.runId, outcome)) void this.sendNextQueued(item.runId);
      this.pump();
    }
  }
}
