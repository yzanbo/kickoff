import fs from "node:fs/promises";
import path from "node:path";
import type { ApprovalCenter } from "./approvals.js";
import { isUnreadEvent } from "@shared/chat/state";
import type { Bus } from "../bus.js";
import { errorMessage } from "@shared/errors";
import { currentBranch } from "../git/index.js";
import { isInside } from "../system/paths.js";
import { buildSystemPrompt, CHAT_POLICY } from "./policy.js";
import type { AgentProvider, ProviderCallbacks, ProviderTurnParams, ProviderTurnResult, TurnControl } from "../providers/types.js";
import type { Store } from "../db/store.js";
import { networkStoppedSubagents, unfinishedSubagents } from "@shared/chat/subagents";
import type { BackgroundState, Project, ProviderId, Chat } from "@shared/types";
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
  controls?: Map<number, TurnControl>;
  /** 会話を圧縮している最中のチャットと、圧縮を始めた時刻（チャットの詳細でも返すため、Runner が持つ） */
  compacting?: Map<number, string>;
}

/** 待機列の 1 件 */
export interface QueueItem {
  chatId: number;
  prompt: string;
  /** 指示の ID（自分の発言の記録の message_uuid。ファイルを戻すときの目印） */
  promptId?: string;
  /** 会話の要約（/compact）。発言・結果としては残さず、未読にもしない */
  compact?: boolean;
}

/** 1 回の実行の終わり方（Runner が次に何をするかを決める） */
export interface TurnOutcome {
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
export async function executeTurn(deps: ExecutionDeps, { chatId, prompt, promptId, compact = false }: QueueItem, signal: AbortSignal): Promise<TurnOutcome> {
  const { store, providers, bus } = deps;
  try {
    const chat = store.getChat(chatId)!;
    const project = store.getProject(chat.project_id)!;
    const cwd = await resolveWorkdir(chat, project);
    // 作業しているブランチを覚えておく（ワークツリーを片付けたあとも、どのブランチの作業だったか分かるように。外れていれば前のまま）
    const branch = await currentBranch(cwd);
    store.updateChat(chatId, { status: "running", turn_started_at: new Date().toISOString(), ...(branch ? { branch } : {}) });
    // この実行より前の記録（止まったサブエージェントを、この実行の分だけ数えるため）
    const since = store.listEvents(chatId).at(-1)?.id ?? 0;

    const result = await providers[chat.provider].run(buildTurnParams(deps, chat, project, cwd, prompt, promptId), callbacksFor(deps, chat, signal, compact), signal);
    const network = result.status === "failed" && Boolean(result.network);
    applyResult(store, chatId, result, compact, since, network);
    const usageLimit = result.status === "failed" && !network ? result.usageLimit : undefined;
    if (!network) return { status: result.status, network, ...(usageLimit ? { usageLimit } : {}) };
    const stoppedAgents = networkStoppedSubagents(store.listEvents(chatId), since).map((s) => ({ agentId: s.agentId!, description: s.description }));
    return { status: result.status, network, stoppedAgents };
  } catch (e) {
    const message = errorMessage(e);
    // 失敗も、見るまでは未読にする
    store.updateChat(chatId, { status: "failed", error: message, unread: true });
    store.addEvent(chatId, { type: "error", message });
    return { status: "failed", network: false };
  } finally {
    // 再試行・裏の作業の表示を消す（終わったので。Claude Code が終わると裏の作業も残らない）
    const chat = store.getChat(chatId);
    if (chat) bus?.publish({ type: "chat_retry", project_id: chat.project_id, chat_id: chatId, retry: null });
    deps.controls?.delete(chatId);
    if (deps.background?.delete(chatId) && chat) bus?.publish({ type: "chat_background", project_id: chat.project_id, chat_id: chatId, background: null });
    if (deps.compacting?.delete(chatId) && chat) bus?.publish({ type: "chat_compacting", project_id: chat.project_id, chat_id: chatId, since: null });
  }
}

/** 作業場所: チャットのワークツリー → プロジェクトのフォルダ（本体）。フォルダが消えていれば（ワークツリーをアプリの外で消したときなど）分かる文で止める */
async function resolveWorkdir(chat: Chat, project: Project): Promise<string> {
  const cwd = chat.worktree_path || project.repo_path;
  const isDir = await fs.stat(cwd).then((s) => s.isDirectory(), () => false);
  if (!isDir) throw new Error(`作業場所のフォルダが見つかりません（${cwd}）。ワークツリーが消された可能性があります。新しいチャットで作業場所を選び直してください`);
  return cwd;
}

/** プロバイダーに渡すもの（作業場所・指示・権限） */
function buildTurnParams(deps: ExecutionDeps, chat: Chat, project: Project, cwd: string, prompt: string, promptId?: string): ProviderTurnParams {
  return {
    cwd,
    prompt,
    ...(promptId ? { promptId } : {}),
    systemPrompt: buildSystemPrompt(project, cwd),
    policy: CHAT_POLICY,
    resumeSessionId: chat.session_id,
    model: chat.model,
    effort: chat.effort,
    permissionMode: chat.permission_mode,
    fastMode: chat.fast_mode,
    // 添付ファイルの保存先と参照資料を読めるようにし、リポジトリの外の参照資料には書き込ませない
    additionalDirectories: [...(deps.uploads ? [deps.uploads.dir] : []), ...referenceDirectories(project)],
    // 作業場所の外の参照資料は読むだけ（ワークツリーのチャットからは、本体の中の資料も読むだけ）
    readOnlyPaths: project.references.map((r) => r.path).filter((p) => !isInside(cwd, p)),
  };
}

/** プロバイダーからの知らせ: 途中経過は配るだけ、イベントは記録、承認依頼は回答を待つ（待つ間は waiting） */
function callbacksFor({ store, approvals, bus, background, controls, compacting }: ExecutionDeps, chat: Chat, signal: AbortSignal, compact: boolean): ProviderCallbacks {
  const chatId = chat.id;
  const projectId = chat.project_id;
  return {
    subagentProgress: (subagent) => {
      bus?.publish({ type: "chat_subagent", project_id: projectId, chat_id: chatId, subagent });
    },
    retry: (retry) => {
      bus?.publish({ type: "chat_retry", project_id: projectId, chat_id: chatId, retry });
    },
    control: (control) => {
      if (control) controls?.set(chatId, control);
      else controls?.delete(chatId);
    },
    background: (state) => {
      background?.set(chatId, state);
      bus?.publish({ type: "chat_background", project_id: projectId, chat_id: chatId, background: state });
    },
    compacting: (active) => {
      const since = active ? new Date().toISOString() : null;
      if (since) compacting?.set(chatId, since);
      else compacting?.delete(chatId);
      bus?.publish({ type: "chat_compacting", project_id: projectId, chat_id: chatId, since });
    },
    stream: (text) => {
      bus?.publish({ type: "chat_delta", project_id: projectId, chat_id: chatId, text });
    },
    emit: (event) => {
      if (event.type === "init" && event.session_id !== store.getChat(chatId)?.session_id) {
        store.updateChat(chatId, { session_id: event.session_id });
      }
      const saved = store.addEvent(chatId, event);
      // 作業中でも、AI の文章の返答が届いたら未読にする（一番下まで見ると既読。要約の途中経過では付けない）
      if (!compact && isUnreadEvent(saved) && !store.getChat(chatId)?.unread) store.setChatUnread(chatId, true);
    },
    requestApproval: async (req, approvalSignal) => {
      const { approval, decision } = approvals.request({ chatId, projectId }, req, approvalSignal);
      store.addEvent(chatId, {
        type: "approval",
        approval_id: approval.id,
        kind: approval.kind,
        tool_name: approval.tool_name,
        title: approval.title,
      });
      store.updateChat(chatId, { status: "waiting" });
      const answer = await decision;
      // AI からの質問に答えたときは、何と答えたか（選んだままの回答と添付）も残す（画面は「質問への回答」の吹き出しで出す）
      store.addEvent(chatId, {
        type: "approval_resolved",
        approval_id: approval.id,
        action: answer.action,
        kind: approval.kind,
        ...(answer.action === "answer"
          ? { answers: answer.plain ?? answer.answers, ...(answer.attachments ? { attachments: answer.attachments } : {}) }
          : {}),
      });
      if (!signal.aborted && approvals.list({ chatId }).length === 0) {
        store.updateChat(chatId, { status: "running" });
      }
      return answer;
    },
  };
}

/** 結果をチャットに反映する（状態・費用・回数・コンテキスト・未読） */
function applyResult(store: Store, chatId: number, result: ProviderTurnResult, compact: boolean, since: number, network: boolean) {
  const current = store.getChat(chatId)!;
  store.updateChat(chatId, {
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
    unread: compact || result.status === "cancelled" ? current.unread : true,
  });
  // この実行で始めたサブエージェントが終わっていなければ、作業の終わりとともに止まったことを知らせる
  // （Claude Code のプロセスが終わるため。見た目は進んでいるようで、実は止まっているのを防ぐ）。
  // 通信の切断のときは、つながってから再開する段取り（reconnect）が知らせる
  const stopped = compact || network ? [] : unfinishedSubagents(store.listEvents(chatId), since).map((s) => s.description);
  if (stopped.length > 0) {
    store.addEvent(chatId, {
      type: "notice",
      message: `サブエージェント ${stopped.length} 件（${stopped.join("、")}）は、作業の終わりとともに止まりました。続けるときは、サブエージェントの一覧の「再開」を押してください。`,
    });
  }
  // 要約は compact イベントだけを残す（失敗したときは理由を残す）
  if (!compact || result.status !== "completed") {
    store.addEvent(chatId, {
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
