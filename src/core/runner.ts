import { errorMessage } from "./errors.js";
import { FollowupQueue } from "./followups.js";
import { executeRun, type ExecutionDeps, type QueueItem } from "./runExecution.js";
import { resolveRunDefaults } from "./runDefaults.js";
import type { Attachment, QueuedMessage, Run, RunOptions } from "./types.js";
import type { UsageMonitor } from "./usage.js";
import { withAttachmentNote } from "./uploads.js";

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
 * 1 回の実行の中身（作業場所・プロバイダーの呼び出し・結果の反映）は runExecution.ts
 */
export class Runner {
  private readonly active = new Map<number, AbortController>();
  private readonly queue: QueueItem[] = [];
  private readonly followups: FollowupQueue;
  /** アプリを終えるところ（待ちの列を送らない） */
  private shuttingDown = false;

  constructor(private readonly deps: ExecutionDeps & { usage: UsageMonitor }) {
    this.followups = new FollowupQueue((runId, queue) => {
      const run = deps.store.getRun(runId);
      if (run) deps.bus?.publish({ type: "run_queue", project_id: run.project_id, run_id: runId, queue });
    });
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
    if (!input.title) void this.autoTitle(run.id, input.prompt || attachments.map((a) => a.name).join("、"));
    this.enqueue({ runId: run.id, prompt: await this.promptWithAttachments(input.prompt, attachments) });
    return store.getRun(run.id)!;
  }

  /** 終了した会話に追加の指示を送り、続きから再開する */
  async send(runId: number, text: string, options: RunOptions = {}, attachments: Attachment[] = []): Promise<Run> {
    const { store } = this.deps;
    const run = store.getRun(runId);
    if (!run) throw new Error("実行が見つかりません");
    if (this.isBusy(runId)) throw new Error("エージェントが作業中です。終わってから送ってください");
    store.addEvent(run.id, { type: "user", text, ...(attachments.length ? { attachments } : {}) });
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
    this.enqueue({ runId: run.id, prompt: await this.promptWithAttachments(text, attachments) });
    return store.getRun(run.id)!;
  }

  /** 作業中のチャットの次の指示の待ちの列 */
  queued(runId: number): QueuedMessage[] {
    return this.followups.list(runId);
  }

  /**
   * 次の指示を送る。作業中なら待ちの列に入れ（終わったら順に送る）、作業中でなければすぐ送る。
   * queued: 列に入れたか、id: 列に入れたその指示の ID（「割り込んで送る」で、すぐ送るのに使う）
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
  removeQueued(runId: number, id: string): boolean {
    return this.followups.remove(runId, id);
  }

  /** 待ちの指示の文を書き換える（なければ false。文も添付もなくなるなら断る） */
  editQueued(runId: number, id: string, text: string): boolean {
    const message = this.followups.list(runId).find((m) => m.id === id);
    if (!message) return false;
    if (!text.trim() && message.attachments.length === 0) throw new Error("メッセージか添付ファイルが必要です");
    return this.followups.edit(runId, id, text.trim());
  }

  /** 待ちの指示をすべて消す（消した数を返す） */
  clearQueued(runId: number): number {
    return this.followups.clear(runId);
  }

  /** 待ちの列を並べ替える（なければ false） */
  moveQueued(runId: number, id: string, index: number): boolean {
    return this.followups.move(runId, id, index);
  }

  /**
   * 待ちの 1 件をすぐ送る。作業中なら列の先頭に移していまの作業を止め、止まったら送る（なければ false）
   */
  async sendQueuedNow(runId: number, id: string): Promise<boolean> {
    if (!this.followups.has(runId, id)) return false;
    if (this.active.has(runId)) {
      // 列の先頭に移して止める（止まったら、先頭から送る）
      this.followups.move(runId, id, 0);
      this.active.get(runId)!.abort();
      return true;
    }
    // 順番待ち（まだ始まっていない）なら取りやめてから送る
    if (this.isBusy(runId)) this.cancel(runId);
    const message = this.followups.take(runId, id)!;
    await this.send(runId, message.text, message.options, message.attachments);
    return true;
  }

  /**
   * 待ちの指示をすべて 1 つにまとめて、すぐ送る（作業中なら止めてから送る）。待ちがなければ false
   */
  async sendAllQueued(runId: number): Promise<boolean> {
    const merged = this.followups.merge(runId);
    if (!merged) return false;
    return this.sendQueuedNow(runId, merged.id);
  }

  /** チャットを消したとき、待ちの列も消す */
  forgetQueued(runId: number) {
    this.followups.forget(runId);
  }

  /** 待ちの列の先頭を送る（送れなければ、理由をチャットに残す） */
  private async sendNextQueued(runId: number) {
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
   * 会話の記録には発言として残さず、要約したこと（compact イベント）だけが残る。終わっても確認待ちにしない
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

  /** チャット名を AI に付けてもらう（ユーザーが名前を変えていなければ置き換える） */
  private async autoTitle(runId: number, text: string) {
    const run = this.deps.store.getRun(runId);
    const provider = run ? this.deps.providers[run.provider] : undefined;
    if (!run || !provider?.title || !text.trim()) return;
    try {
      const title = await provider.title(text);
      const latest = this.deps.store.getRun(runId);
      if (title && latest && latest.title === run.title) this.deps.store.updateRun(runId, { title });
    } catch {
      // 付けられなくても困らない（最初の発言のまま）
    }
  }

  /** 添付ファイルのパスをメッセージに書き添える（エージェントは Read ツールで読む） */
  private async promptWithAttachments(text: string, attachments: Attachment[]): Promise<string> {
    if (attachments.length === 0 || !this.deps.uploads) return text;
    const files = [];
    for (const attachment of attachments) {
      const resolved = await this.deps.uploads.resolve(attachment.id);
      if (resolved) files.push({ path: resolved.path, attachment });
    }
    return withAttachmentNote(text, files);
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
    try {
      await executeRun(this.deps, item, controller.signal);
    } finally {
      this.active.delete(item.runId);
      void this.deps.usage.refresh();
      // 終わったら、待ちの列の次の指示を送る（完了でも、止めた・失敗したときでも送る。アプリを終えるときは送らない）
      if (!this.shuttingDown) void this.sendNextQueued(item.runId);
      this.pump();
    }
  }
}

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}
