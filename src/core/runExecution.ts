import fs from "node:fs/promises";
import path from "node:path";
import type { ApprovalCenter } from "./approvals.js";
import { isUnreadEvent } from "./board.js";
import type { Bus } from "./bus.js";
import { errorMessage } from "./errors.js";
import { currentBranch } from "./git.js";
import { isInside } from "./paths.js";
import { buildSystemPrompt, CHAT_POLICY } from "./chatPolicy.js";
import type { AgentProvider, ProviderCallbacks, ProviderRunParams, ProviderRunResult, RunControl } from "./providers/types.js";
import type { Store } from "./store.js";
import { networkStoppedSubagents, unfinishedSubagents } from "./subagents.js";
import type { BackgroundState, Project, ProviderId, Run } from "./types.js";
import type { UploadStore } from "./uploads.js";

/** 実行に使うもの（Runner から受け取る） */
export interface ExecutionDeps {
  store: Store;
  approvals: ApprovalCenter;
  providers: Record<ProviderId, AgentProvider>;
  uploads?: UploadStore;
  bus?: Bus;
  /** 作業中のチャットの、裏で動いている作業の様子（チャットの詳細でも返すため、Runner が持つ） */
  background?: Map<number, BackgroundState>;
  /** 作業中のチャットへの操作（止めずに発言を足す・裏の作業を止める。Runner が持つ） */
  controls?: Map<number, RunControl>;
  /** 会話を圧縮している最中のチャットと、圧縮を始めた時刻（チャットの詳細でも返すため、Runner が持つ） */
  compacting?: Map<number, string>;
}

/** 待機列の 1 件 */
export interface QueueItem {
  runId: number;
  prompt: string;
  /** 指示の ID（自分の発言の記録の message_uuid。ファイルを戻すときの目印） */
  promptId?: string;
  /** 会話の要約（/compact）。発言・結果としては残さず、未読にもしない */
  compact?: boolean;
}

/** 1 回の実行の終わり方（Runner が次に何をするかを決める） */
export interface RunOutcome {
  status: "completed" | "failed" | "cancelled";
  /** 通信の切断で失敗した（つながったら自動で再開する） */
  network: boolean;
  /** 通信の切断で止まったサブエージェント（再開するときに、続きから再開するよう頼む） */
  stoppedAgents?: StoppedAgent[];
  /** 使用枠の上限で止まった（枠が戻ったら、続けるかを聞く。resetsAt: 戻る時刻。分からなければ null） */
  usageLimit?: { resetsAt: string | null };
}

/** 通信の切断で止まったサブエージェント（SendMessage の宛先と名前） */
export interface StoppedAgent {
  agentId: string;
  description: string;
}

/**
 * 1 回の実行（待機列から取り出したもの）を最後まで進める: 作業場所を決めてプロバイダーを動かし、結果をチャットに反映する。
 * 失敗はチャットの失敗として記録する（投げない）。中断は signal で伝わる
 */
export async function executeRun(deps: ExecutionDeps, { runId, prompt, promptId, compact = false }: QueueItem, signal: AbortSignal): Promise<RunOutcome> {
  const { store, providers, bus } = deps;
  try {
    const run = store.getRun(runId)!;
    const project = store.getProject(run.project_id)!;
    const cwd = await resolveWorkdir(run, project);
    // 作業しているブランチを覚えておく（ワークツリーを片付けたあとも、どのブランチの作業だったか分かるように。外れていれば前のまま）
    const branch = await currentBranch(cwd);
    store.updateRun(runId, { status: "running", turn_started_at: new Date().toISOString(), ...(branch ? { branch } : {}) });
    // この実行より前の記録（止まったサブエージェントを、この実行の分だけ数えるため）
    const since = store.listEvents(runId).at(-1)?.id ?? 0;

    const result = await providers[run.provider].run(buildRunParams(deps, run, project, cwd, prompt, promptId), callbacksFor(deps, run, signal, compact), signal);
    const network = result.status === "failed" && Boolean(result.network);
    applyResult(store, runId, result, compact, since, network);
    const usageLimit = result.status === "failed" && !network ? result.usageLimit : undefined;
    if (!network) return { status: result.status, network, ...(usageLimit ? { usageLimit } : {}) };
    const stoppedAgents = networkStoppedSubagents(store.listEvents(runId), since).map((s) => ({ agentId: s.agentId!, description: s.description }));
    return { status: result.status, network, stoppedAgents };
  } catch (e) {
    const message = errorMessage(e);
    // 失敗も、見るまでは未読にする
    store.updateRun(runId, { status: "failed", error: message, attention: true });
    store.addEvent(runId, { type: "error", message });
    return { status: "failed", network: false };
  } finally {
    // 再試行・裏の作業の表示を消す（終わったので。Claude Code が終わると裏の作業も残らない）
    const run = store.getRun(runId);
    if (run) bus?.publish({ type: "run_retry", project_id: run.project_id, run_id: runId, retry: null });
    deps.controls?.delete(runId);
    if (deps.background?.delete(runId) && run) bus?.publish({ type: "run_background", project_id: run.project_id, run_id: runId, background: null });
    if (deps.compacting?.delete(runId) && run) bus?.publish({ type: "run_compacting", project_id: run.project_id, run_id: runId, since: null });
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
function buildRunParams(deps: ExecutionDeps, run: Run, project: Project, cwd: string, prompt: string, promptId?: string): ProviderRunParams {
  return {
    cwd,
    prompt,
    ...(promptId ? { promptId } : {}),
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
function callbacksFor({ store, approvals, bus, background, controls, compacting }: ExecutionDeps, run: Run, signal: AbortSignal, compact: boolean): ProviderCallbacks {
  const runId = run.id;
  const projectId = run.project_id;
  return {
    subagentProgress: (subagent) => {
      bus?.publish({ type: "run_subagent", project_id: projectId, run_id: runId, subagent });
    },
    retry: (retry) => {
      bus?.publish({ type: "run_retry", project_id: projectId, run_id: runId, retry });
    },
    control: (control) => {
      if (control) controls?.set(runId, control);
      else controls?.delete(runId);
    },
    background: (state) => {
      background?.set(runId, state);
      bus?.publish({ type: "run_background", project_id: projectId, run_id: runId, background: state });
    },
    compacting: (active) => {
      const since = active ? new Date().toISOString() : null;
      if (since) compacting?.set(runId, since);
      else compacting?.delete(runId);
      bus?.publish({ type: "run_compacting", project_id: projectId, run_id: runId, since });
    },
    stream: (text) => {
      bus?.publish({ type: "run_delta", project_id: projectId, run_id: runId, text });
    },
    emit: (event) => {
      if (event.type === "init" && event.session_id !== store.getRun(runId)?.session_id) {
        store.updateRun(runId, { session_id: event.session_id });
      }
      const saved = store.addEvent(runId, event);
      // 作業中でも、AI の文章の返答が届いたら未読にする（一番下まで見ると既読。要約の途中経過では付けない）
      if (!compact && isUnreadEvent(saved) && !store.getRun(runId)?.attention) store.setRunAttention(runId, true);
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
      // AI からの質問に答えたときは、何と答えたか（選んだままの回答と添付）も残す（画面は「質問への回答」の吹き出しで出す）
      store.addEvent(runId, {
        type: "approval_resolved",
        approval_id: approval.id,
        action: answer.action,
        kind: approval.kind,
        ...(answer.action === "answer"
          ? { answers: answer.plain ?? answer.answers, ...(answer.attachments ? { attachments: answer.attachments } : {}) }
          : {}),
      });
      if (!signal.aborted && approvals.list({ runId }).length === 0) {
        store.updateRun(runId, { status: "running" });
      }
      return answer;
    },
  };
}

/** 結果をチャットに反映する（状態・費用・回数・コンテキスト・未読） */
function applyResult(store: Store, runId: number, result: ProviderRunResult, compact: boolean, since: number, network: boolean) {
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
    // 終わったら「未読」にする（中断・要約のときは除く）。最後の結果を一番下まで見ると消える
    attention: compact || result.status === "cancelled" ? current.attention : true,
  });
  // この実行で始めたサブエージェントが終わっていなければ、作業の終わりとともに止まったことを知らせる
  // （Claude Code のプロセスが終わるため。見た目は進んでいるようで、実は止まっているのを防ぐ）。
  // 通信の切断のときは、つながってから再開する段取り（runReconnect）が知らせる
  const stopped = compact || network ? [] : unfinishedSubagents(store.listEvents(runId), since).map((s) => s.description);
  if (stopped.length > 0) {
    store.addEvent(runId, {
      type: "notice",
      message: `サブエージェント ${stopped.length} 件（${stopped.join("、")}）は、作業の終わりとともに止まりました。続けるときは、サブエージェントの一覧の「再開」を押してください。`,
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
      ...(network ? { network: true } : {}),
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
