import { executeRun, type ExecutionDeps, type QueueItem } from "./runExecution.js";
import { resolveRunDefaults } from "./sectionDefaults.js";
import type { Attachment, Phase, Run, RunOptions } from "./types.js";
import type { UsageMonitor } from "./usage.js";
import { withAttachmentNote } from "./uploads.js";

interface StartRunInput {
  projectId: number;
  phase: Phase;
  taskId?: number | null;
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
 * 1 回の実行の中身（作業場所・プロバイダーの呼び出し・結果の反映）は runExecution.ts
 */
export class Runner {
  private readonly active = new Map<number, AbortController>();
  private readonly queue: QueueItem[] = [];

  constructor(private readonly deps: ExecutionDeps & { usage: UsageMonitor }) {}

  async start(input: StartRunInput): Promise<Run> {
    const { store, providers } = this.deps;
    const project = store.getProject(input.projectId);
    if (!project) throw new Error("プロジェクトが見つかりません");
    const task = input.taskId ? store.getTask(input.taskId) : undefined;
    if (input.taskId && (!task || task.project_id !== project.id)) throw new Error("タスクが見つかりません");
    if (!providers[project.provider].implemented) throw new Error(`${providers[project.provider].label} はまだ使えません`);

    // チャット欄で指定がなければ、プロジェクトの既定 → アプリ全体の設定の順に使う
    const defaults = resolveRunDefaults(store.getSettings(), project.defaults);
    const options = input.options ?? {};
    const model = options.model ?? (project.provider === "claude" ? defaults.model || null : null);
    const run = store.createRun({
      project_id: project.id,
      task_id: task?.id ?? null,
      phase: input.phase,
      provider: project.provider,
      title: input.title ?? task?.title ?? firstLine(input.prompt),
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
      attention: 0,
      model: options.model === undefined ? undefined : options.model,
      effort: options.effort === undefined ? undefined : options.effort,
      permission_mode: options.permission_mode ?? undefined,
      fast_mode: options.fast_mode === undefined || options.fast_mode === null ? undefined : options.fast_mode ? 1 : 0,
    });
    this.enqueue({ runId: run.id, prompt: await this.promptWithAttachments(text, attachments) });
    return store.getRun(run.id)!;
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
      this.pump();
    }
  }
}

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}
