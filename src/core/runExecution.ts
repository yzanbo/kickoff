import fs from "node:fs/promises";
import path from "node:path";
import type { ApprovalCenter } from "./approvals.js";
import type { Bus } from "./bus.js";
import { errorMessage } from "./errors.js";
import { currentBranch } from "./git.js";
import { createKickoffTools } from "./kickoffTools.js";
import { isInside } from "./paths.js";
import { buildSystemPrompt, phasePolicy } from "./phases.js";
import type { AgentProvider, ProviderCallbacks, ProviderRunParams, ProviderRunResult } from "./providers/types.js";
import type { Store } from "./store.js";
import type { Project, ProviderId, Run, Task } from "./types.js";
import type { UploadStore } from "./uploads.js";

/** 実行に使うもの（Runner から受け取る） */
export interface ExecutionDeps {
  store: Store;
  approvals: ApprovalCenter;
  providers: Record<ProviderId, AgentProvider>;
  uploads?: UploadStore;
  bus?: Bus;
}

/** 待機列の 1 件 */
export interface QueueItem {
  runId: number;
  prompt: string;
  /** 会話の要約（/compact）。発言・結果としては残さず、確認待ちにもしない */
  compact?: boolean;
}

/**
 * 1 回の実行（待機列から取り出したもの）を最後まで進める: 作業場所を決めてプロバイダーを動かし、結果をチャットとタスクに反映する。
 * 失敗はチャットの失敗として記録する（投げない）。中断は signal で伝わる
 */
export async function executeRun(deps: ExecutionDeps, { runId, prompt, compact = false }: QueueItem, signal: AbortSignal): Promise<void> {
  const { store, providers } = deps;
  try {
    const run = store.getRun(runId)!;
    const project = store.getProject(run.project_id)!;
    const task = run.task_id ? (store.getTask(run.task_id) ?? null) : null;
    const cwd = await resolveWorkdir(run, task, project);
    // 作業しているブランチを覚えておく（ワークツリーを片付けたあとも、どのブランチの作業だったか分かるように。外れていれば前のまま）
    const branch = await currentBranch(cwd);
    store.updateRun(runId, { status: "running", turn_started_at: new Date().toISOString(), ...(branch ? { branch } : {}) });
    if (task && !compact && (task.status === "todo" || task.status === "blocked")) store.updateTask(task.id, { status: "in_progress" });

    const result = await providers[run.provider].run(buildRunParams(deps, run, project, task, cwd, prompt), callbacksFor(deps, run, task, signal), signal);
    applyResult(store, runId, task, result, compact);
  } catch (e) {
    const message = errorMessage(e);
    store.updateRun(runId, { status: "failed", error: message });
    store.addEvent(runId, { type: "error", message });
  }
}

/** 作業場所: チャットのワークツリー → タスクのワークツリー → プロジェクトのフォルダ（本体）。フォルダが消えていれば（ワークツリーをアプリの外で消したときなど）分かる文で止める */
async function resolveWorkdir(run: Run, task: Task | null, project: Project): Promise<string> {
  const cwd = run.worktree_path || task?.worktree_path || project.repo_path;
  const isDir = await fs.stat(cwd).then((s) => s.isDirectory(), () => false);
  if (!isDir) throw new Error(`作業場所のフォルダが見つかりません（${cwd}）。ワークツリーが消された可能性があります。新しいチャットで作業場所を選び直してください`);
  return cwd;
}

/** プロバイダーに渡すもの（作業場所・指示・権限・Kickoff のツール） */
function buildRunParams(deps: ExecutionDeps, run: Run, project: Project, task: Task | null, cwd: string, prompt: string): ProviderRunParams {
  const policy = phasePolicy(run.phase, project);
  return {
    cwd,
    prompt,
    systemPrompt: buildSystemPrompt(project, run.phase, task, cwd),
    policy,
    resumeSessionId: run.session_id,
    model: run.model,
    effort: run.effort,
    permissionMode: run.permission_mode,
    fastMode: Boolean(run.fast_mode),
    // 添付ファイルの保存先と参照資料を読めるようにし、リポジトリの外の参照資料には書き込ませない
    additionalDirectories: [...(deps.uploads ? [deps.uploads.dir] : []), ...referenceDirectories(project)],
    // 作業場所の外の参照資料は読むだけ（ワークツリーのチャットからは、本体の中の資料も読むだけ）
    readOnlyPaths: project.references.map((r) => r.path).filter((p) => !isInside(cwd, p)),
    tools: createKickoffTools({
      store: deps.store,
      projectId: project.id,
      runId: run.id,
      taskId: task?.id ?? null,
      phase: run.phase,
      writeScope: policy.writeScope,
      workdir: cwd,
    }),
  };
}

/** プロバイダーからの知らせ: 途中経過は配るだけ、イベントは記録、承認依頼は回答を待つ（待つ間は waiting） */
function callbacksFor({ store, approvals, bus }: ExecutionDeps, run: Run, task: Task | null, signal: AbortSignal): ProviderCallbacks {
  const runId = run.id;
  const projectId = run.project_id;
  return {
    subagentProgress: (subagent) => {
      bus?.publish({ type: "run_subagent", project_id: projectId, run_id: runId, subagent });
    },
    stream: (text) => {
      bus?.publish({ type: "run_delta", project_id: projectId, run_id: runId, text });
    },
    emit: (event) => {
      if (event.type === "init" && event.session_id !== store.getRun(runId)?.session_id) {
        store.updateRun(runId, { session_id: event.session_id });
      }
      store.addEvent(runId, event);
    },
    requestApproval: async (req, approvalSignal) => {
      const { approval, decision } = approvals.request({ runId, projectId, taskId: task?.id ?? null }, req, approvalSignal);
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
      if (!signal.aborted && approvals.list({ runId }).length === 0) {
        store.updateRun(runId, { status: "running" });
      }
      return answer;
    },
  };
}

/** 結果をチャットに反映し（状態・費用・回数・コンテキスト・確認待ち）、タスクの状態を後始末する */
function applyResult(store: Store, runId: number, task: Task | null, result: ProviderRunResult, compact: boolean) {
  const current = store.getRun(runId)!;
  store.updateRun(runId, {
    status: result.status,
    session_id: result.sessionId ?? current.session_id,
    cost_usd: current.cost_usd + (result.costUsd ?? 0),
    // 要約は会話の回数・最後の回答に数えない
    num_turns: current.num_turns + (compact ? 0 : (result.turns ?? 0)),
    result: compact ? current.result : (result.result ?? current.result),
    error: result.error ?? null,
    ...(result.context
      ? { context_tokens: result.context.tokens, context_window: result.context.window ?? current.context_window }
      : compact && result.status === "completed"
        ? // 要約したあとの大きさが分からないときは、次の応答まで空にしておく
          { context_tokens: null }
        : {}),
    // 終わったら「確認待ち」にする（中断・要約のときは除く）。チャットを開くと消える
    attention: compact || result.status === "cancelled" ? current.attention : 1,
  });
  // 要約は compact イベントだけを残す（失敗したときは理由を残す）
  if (!compact || result.status !== "completed") {
    store.addEvent(runId, {
      type: "result",
      status: result.status,
      text: result.status === "completed" ? result.result : result.error,
      cost_usd: result.costUsd,
      turns: result.turns,
    });
  }

  // エージェントがタスクの状態を更新しなかった場合の後始末（要約はタスクの作業ではないので除く）
  if (task && !compact) {
    const latest = store.getTask(task.id);
    if (latest?.status === "in_progress") {
      store.updateTask(task.id, {
        status: result.status === "completed" ? "review" : result.status === "cancelled" ? "todo" : "blocked",
      });
    }
  }
}

/** 参照資料を読めるようにするフォルダ（ファイルはそのフォルダ）。重複は除く */
function referenceDirectories(project: Project): string[] {
  return [...new Set(project.references.map((r) => (r.kind === "folder" ? r.path : path.dirname(r.path))))];
}
