import fs from "node:fs/promises";
import path from "node:path";
import { unfinishedBackgroundAgents } from "./backgroundTasks.js";
import type { ApprovalCenter } from "./approvals.js";
import type { Bus } from "./bus.js";
import { errorMessage } from "./errors.js";
import { currentBranch } from "./git.js";
import { isInside } from "./paths.js";
import { buildSystemPrompt, CHAT_POLICY } from "./chatPolicy.js";
import type { AgentProvider, ProviderCallbacks, ProviderRunParams, ProviderRunResult } from "./providers/types.js";
import type { Store } from "./store.js";
import type { Project, ProviderId, Run } from "./types.js";
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
  /** 会話の要約（/compact）。発言・結果としては残さず、未読にもしない */
  compact?: boolean;
}

/**
 * 1 回の実行（待機列から取り出したもの）を最後まで進める: 作業場所を決めてプロバイダーを動かし、結果をチャットに反映する。
 * 失敗はチャットの失敗として記録する（投げない）。中断は signal で伝わる
 */
export async function executeRun(deps: ExecutionDeps, { runId, prompt, compact = false }: QueueItem, signal: AbortSignal): Promise<void> {
  const { store, providers } = deps;
  try {
    const run = store.getRun(runId)!;
    const project = store.getProject(run.project_id)!;
    const cwd = await resolveWorkdir(run, project);
    // 作業しているブランチを覚えておく（ワークツリーを片付けたあとも、どのブランチの作業だったか分かるように。外れていれば前のまま）
    const branch = await currentBranch(cwd);
    store.updateRun(runId, { status: "running", turn_started_at: new Date().toISOString(), ...(branch ? { branch } : {}) });

    const result = await providers[run.provider].run(buildRunParams(deps, run, project, cwd, prompt), callbacksFor(deps, run, signal), signal);
    applyResult(store, runId, result, compact);
  } catch (e) {
    const message = errorMessage(e);
    // 失敗も、見るまでは未読にする
    store.updateRun(runId, { status: "failed", error: message, attention: true });
    store.addEvent(runId, { type: "error", message });
  }
}

/** 作業場所: チャットのワークツリー → プロジェクトのフォルダ（本体）。フォルダが消えていれば（ワークツリーをアプリの外で消したときなど）分かる文で止める */
async function resolveWorkdir(run: Run, project: Project): Promise<string> {
  const cwd = run.worktree_path || project.repo_path;
  const isDir = await fs.stat(cwd).then((s) => s.isDirectory(), () => false);
  if (!isDir) throw new Error(`作業場所のフォルダが見つかりません（${cwd}）。ワークツリーが消された可能性があります。新しいチャットで作業場所を選び直してください`);
  return cwd;
}

/** プロバイダーに渡すもの（作業場所・指示・権限） */
function buildRunParams(deps: ExecutionDeps, run: Run, project: Project, cwd: string, prompt: string): ProviderRunParams {
  return {
    cwd,
    prompt,
    systemPrompt: buildSystemPrompt(project, cwd),
    policy: CHAT_POLICY,
    resumeSessionId: run.session_id,
    model: run.model,
    effort: run.effort,
    permissionMode: run.permission_mode,
    fastMode: run.fast_mode,
    // 添付ファイルの保存先と参照資料を読めるようにし、リポジトリの外の参照資料には書き込ませない
    additionalDirectories: [...(deps.uploads ? [deps.uploads.dir] : []), ...referenceDirectories(project)],
    // 作業場所の外の参照資料は読むだけ（ワークツリーのチャットからは、本体の中の資料も読むだけ）
    readOnlyPaths: project.references.map((r) => r.path).filter((p) => !isInside(cwd, p)),
  };
}

/** プロバイダーからの知らせ: 途中経過は配るだけ、イベントは記録、承認依頼は回答を待つ（待つ間は waiting） */
function callbacksFor({ store, approvals, bus }: ExecutionDeps, run: Run, signal: AbortSignal): ProviderCallbacks {
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
      const { approval, decision } = approvals.request({ runId, projectId }, req, approvalSignal);
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

/** 結果をチャットに反映する（状態・費用・回数・コンテキスト・未読） */
function applyResult(store: Store, runId: number, result: ProviderRunResult, compact: boolean) {
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
    // 終わったら「未読」にする（中断・要約のときは除く）。チャットを開くと消える
    attention: compact || result.status === "cancelled" ? current.attention : true,
  });
  // 裏で動かしたサブエージェントが終わっていなければ、作業の終わりとともに止まったことを知らせる
  // （Claude Code のプロセスが終わるため。見た目は進んでいるようで、実は止まっているのを防ぐ）
  const stopped = compact ? [] : unfinishedBackgroundAgents(store.listEvents(runId));
  if (stopped.length > 0) {
    store.addEvent(runId, {
      type: "notice",
      message: `裏で動かしていたサブエージェント ${stopped.length} 件（${stopped.join("、")}）は、作業の終わりとともに止まりました。続けるときは、もう一度頼んでください。`,
    });
  }
  // 要約は compact イベントだけを残す（失敗したときは理由を残す）
  if (!compact || result.status !== "completed") {
    store.addEvent(runId, {
      type: "result",
      status: result.status,
      text: result.status === "completed" ? result.result : result.error,
      cost_usd: result.costUsd,
      turns: result.turns,
      // 分岐・巻き戻しの起点（最後まで終わったときだけ。止めた作業の最後のメッセージはセッションに残らないことがある）
      ...(result.status === "completed" && result.lastMessageId && result.sessionId
        ? { session_id: result.sessionId, message_id: result.lastMessageId }
        : {}),
    });
  }
}

/** 参照資料を読めるようにするフォルダ（ファイルはそのフォルダ）。重複は除く */
function referenceDirectories(project: Project): string[] {
  return [...new Set(project.references.map((r) => (r.kind === "folder" ? r.path : path.dirname(r.path))))];
}
