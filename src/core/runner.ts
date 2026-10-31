import type { ApprovalCenter } from "./approvals.js";
import { createKickoffTools } from "./kickoffTools.js";
import { buildSystemPrompt, phasePolicy } from "./phases.js";
import type { AgentProvider } from "./providers/index.js";
import type { Store } from "./store.js";
import type { Phase, ProviderId, Run, RunOptions } from "./types.js";
import type { UsageMonitor } from "./usage.js";

export interface StartRunInput {
  projectId: number;
  phase: Phase;
  taskId?: number | null;
  prompt: string;
  title?: string;
  options?: RunOptions;
}

interface QueueItem {
  runId: number;
  prompt: string;
}

/**
 * エージェントの実行を管理する。
 * 同時実行数の上限を超えた分は待機列に入れ、空きができしだい順に開始する。
 * 1 つの実行（Run）は 1 つの会話で、追加のメッセージを送ると同じセッションを続きから再開する。
 */
export class Runner {
  private readonly active = new Map<number, AbortController>();
  private readonly queue: QueueItem[] = [];

  constructor(
    private readonly deps: {
      store: Store;
      approvals: ApprovalCenter;
      providers: Record<ProviderId, AgentProvider>;
      usage: UsageMonitor;
    },
  ) {}

  start(input: StartRunInput): Run {
    const { store, providers } = this.deps;
    const project = store.getProject(input.projectId);
    if (!project) throw new Error("プロジェクトが見つかりません");
    const task = input.taskId ? store.getTask(input.taskId) : undefined;
    if (input.taskId && (!task || task.project_id !== project.id)) throw new Error("タスクが見つかりません");
    if (!providers[project.provider].implemented) throw new Error(`${providers[project.provider].label} はまだ使えません`);

    const settings = store.getSettings();
    const options = input.options ?? {};
    const model = options.model ?? (project.provider === "claude" ? settings.claudeModel || null : null);
    const run = store.createRun({
      project_id: project.id,
      task_id: task?.id ?? null,
      phase: input.phase,
      provider: project.provider,
      title: input.title ?? task?.title ?? firstLine(input.prompt),
      status: "queued",
      model,
      effort: options.effort ?? null,
      permission_mode: options.permission_mode ?? "phase",
    });
    this.rememberModel(project.provider, options.model);
    store.addEvent(run.id, { type: "user", text: input.prompt });
    this.enqueue({ runId: run.id, prompt: input.prompt });
    return store.getRun(run.id)!;
  }

  /** 終了した会話に追加の指示を送り、続きから再開する */
  send(runId: number, text: string, options: RunOptions = {}): Run {
    const { store } = this.deps;
    const run = store.getRun(runId);
    if (!run) throw new Error("実行が見つかりません");
    if (this.isBusy(runId)) throw new Error("エージェントが作業中です。終わってから送ってください");
    store.addEvent(run.id, { type: "user", text });
    // チャット欄でモデルや権限モードを変えた場合は、この続きから反映する
    store.updateRun(run.id, {
      status: "queued",
      error: null,
      model: options.model === undefined ? undefined : options.model,
      effort: options.effort === undefined ? undefined : options.effort,
      permission_mode: options.permission_mode ?? undefined,
    });
    this.rememberModel(run.provider, options.model);
    this.enqueue({ runId: run.id, prompt: text });
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

  isBusy(runId: number): boolean {
    return this.active.has(runId) || this.queue.some((q) => q.runId === runId);
  }

  /** アプリ終了時: 実行中のエージェントをすべて止める */
  shutdown() {
    this.queue.length = 0;
    for (const controller of this.active.values()) controller.abort();
  }

  /** 最後に選んだモデルを次回の既定にする */
  private rememberModel(provider: ProviderId, model: string | null | undefined) {
    if (provider === "claude" && model && model !== this.deps.store.getSettings().claudeModel) {
      this.deps.store.updateSettings({ claudeModel: model });
    }
  }

  private enqueue(item: QueueItem) {
    this.queue.push(item);
    this.pump();
  }

  private pump() {
    const limit = this.deps.store.getSettings().maxConcurrentRuns;
    while (this.active.size < limit && this.queue.length > 0) {
      const item = this.queue.shift()!;
      void this.execute(item);
    }
  }

  private async execute({ runId, prompt }: QueueItem) {
    const { store, approvals, providers, usage } = this.deps;
    const controller = new AbortController();
    this.active.set(runId, controller);

    try {
      const run = store.getRun(runId)!;
      const project = store.getProject(run.project_id)!;
      const task = run.task_id ? (store.getTask(run.task_id) ?? null) : null;
      const provider = providers[run.provider];

      store.updateRun(runId, { status: "running" });
      if (task && (task.status === "todo" || task.status === "blocked")) store.updateTask(task.id, { status: "in_progress" });

      const policy = phasePolicy(run.phase, project);
      const result = await provider.run(
        {
          cwd: task?.worktree_path || project.repo_path,
          prompt,
          systemPrompt: buildSystemPrompt(project, run.phase, task),
          policy,
          resumeSessionId: run.session_id,
          model: run.model,
          effort: run.effort,
          permissionMode: run.permission_mode,
          tools: createKickoffTools({
            store,
            projectId: project.id,
            runId,
            taskId: task?.id ?? null,
            phase: run.phase,
            writeScope: policy.writeScope,
          }),
        },
        {
          emit: (event) => {
            if (event.type === "init" && event.session_id !== store.getRun(runId)?.session_id) {
              store.updateRun(runId, { session_id: event.session_id });
            }
            store.addEvent(runId, event);
          },
          requestApproval: async (req, signal) => {
            const { approval, decision } = approvals.request(
              { runId, projectId: project.id, taskId: task?.id ?? null },
              req,
              signal,
            );
            store.addEvent(runId, {
              type: "approval",
              approval_id: approval.id,
              kind: approval.kind,
              tool_name: approval.tool_name,
              title: approval.title,
            });
            store.updateRun(runId, { status: "waiting" });
            const answer = await decision;
            store.addEvent(runId, { type: "approval_resolved", approval_id: approval.id, action: answer.action });
            if (!controller.signal.aborted && approvals.list({ runId }).length === 0) {
              store.updateRun(runId, { status: "running" });
            }
            return answer;
          },
        },
        controller.signal,
      );

      const current = store.getRun(runId)!;
      store.updateRun(runId, {
        status: result.status,
        session_id: result.sessionId ?? current.session_id,
        cost_usd: current.cost_usd + (result.costUsd ?? 0),
        num_turns: current.num_turns + (result.turns ?? 0),
        result: result.result ?? current.result,
        error: result.error ?? null,
      });
      store.addEvent(runId, {
        type: "result",
        status: result.status,
        text: result.status === "completed" ? result.result : result.error,
        cost_usd: result.costUsd,
        turns: result.turns,
      });

      // エージェントがタスクの状態を更新しなかった場合の後始末
      if (task) {
        const latest = store.getTask(task.id);
        if (latest?.status === "in_progress") {
          store.updateTask(task.id, {
            status: result.status === "completed" ? "review" : result.status === "cancelled" ? "todo" : "blocked",
          });
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      store.updateRun(runId, { status: "failed", error: message });
      store.addEvent(runId, { type: "error", message });
    } finally {
      this.active.delete(runId);
      void usage.refresh();
      this.pump();
    }
  }
}

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}
