import { errorMessage } from "@shared/errors";
import { isNetworkError } from "@shared/chat/networkErrors";
import { isUsageLimitError } from "@shared/chat/usageLimit";
import type { SelfInfo } from "../../chat/guard/selfProtection.js";
import type { ProviderCallbacks, ProviderTurnParams, ProviderTurnResult } from "../types.js";
import { createApprovalHandler } from "./approvals.js";
import { appServerLaunch, codexEffort, codexSandboxPolicy, threadOverrides, turnInput } from "./config.js";
import { commandOutputDelta, createItemState, itemCompleted, itemStarted } from "./items.js";
import type { CodexErrorInfo, ThreadItem, ThreadResponse, ThreadResumeParams, ThreadStartParams, ThreadTokenUsage, Turn, TurnError, TurnStartParams, TurnSteerParams } from "./protocol.js";
import type { CodexRpc, CodexSpawn } from "./rpc.js";
import { openSession } from "./session.js";

/** 止めたあと、Codex がターンの終わりを返すまで待つ長さ（過ぎたら app-server ごと止める） */
const INTERRUPT_GRACE_MS = 5000;

export interface TurnDeps {
  spawn: CodexSpawn;
  /** app-server に渡す環境変数の元（process.env） */
  baseEnv: Record<string, string | undefined>;
  self?: SelfInfo;
}

/** 失敗の種類が通信の切断か（HTTP の接続・応答の流れが切れた） */
function isNetworkInfo(info: CodexErrorInfo | null): boolean {
  if (!info || typeof info === "string") return false;
  return ["httpConnectionFailed", "responseStreamConnectionFailed", "responseStreamDisconnected"].some((key) => key in info);
}

/** ターンの終わりを Kickoff の結果にする */
export function turnResult(turn: Turn, threadId: string, usage: ThreadTokenUsage | null, lastText: string, lastError: TurnError | null): ProviderTurnResult {
  const context = usage ? { context: { tokens: usage.last.totalTokens, window: usage.modelContextWindow } } : {};
  if (turn.status === "completed") return { status: "completed", sessionId: threadId, result: lastText, lastMessageId: turn.id, ...context };
  if (turn.status === "interrupted") return { status: "cancelled", sessionId: threadId, ...context };
  const error = turn.error ?? lastError;
  const message = error?.message ?? "Codex のターンが失敗しました";
  const usageLimit = error?.codexErrorInfo === "usageLimitExceeded" || isUsageLimitError(message);
  const network = !usageLimit && (isNetworkInfo(error?.codexErrorInfo ?? null) || isNetworkError(message));
  return {
    status: "failed",
    sessionId: threadId,
    error: error?.additionalDetails ? `${message}（${error.additionalDetails}）` : message,
    ...context,
    ...(network ? { network: true } : {}),
    ...(usageLimit ? { usageLimit: { resetsAt: null } } : {}),
  };
}

/**
 * 1 回の実行（ProviderTurnParams → app-server の thread/start か thread/resume → turn/start → turn/completed）。
 * 作業中に足す発言は turn/steer（control.tell）、止めるのは turn/interrupt。チャット欄の /compact は thread/compact/start
 */
export async function runCodexTurn(deps: TurnDeps, params: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult> {
  if (signal.aborted) return { status: "cancelled", sessionId: params.resumeSessionId };
  const state = createItemState();
  const items = new Map<string, ThreadItem>();
  let threadId: string | null = params.resumeSessionId;
  let turnId: string | null = null;
  let lastText = "";
  let lastError: TurnError | null = null;
  let retries = 0;
  let rpc: CodexRpc | null = null;
  const pendingSteers: string[] = [];
  const compactOnly = params.prompt.trim() === "/compact";

  let finish!: (turn: Turn) => void;
  const done = new Promise<Turn>((resolve) => (finish = resolve));

  const steerNow = (text: string, uuid?: string) => {
    if (!rpc || !threadId || !turnId) return false;
    void rpc.request("turn/steer", { threadId, input: [{ type: "text", text, text_elements: [] }], expectedTurnId: turnId, clientUserMessageId: uuid ?? null } satisfies TurnSteerParams).catch(() => {});
    return true;
  };
  // 断った理由は、ターンが分かってから伝える
  const steer = (text: string) => {
    if (!steerNow(text)) pendingSteers.push(text);
  };

  const ours = (p: { threadId?: string }) => !threadId || p.threadId === threadId;
  const onNotification = (method: string, raw: unknown) => {
    const p = raw as Record<string, unknown> & { threadId?: string };
    if (!ours(p)) return;
    switch (method) {
      case "turn/started": {
        if (turnId) return;
        turnId = (p.turn as Turn).id;
        for (const text of pendingSteers.splice(0)) steerNow(text);
        return;
      }
      case "turn/completed": {
        const turn = p.turn as Turn;
        if (!turnId || turn.id === turnId) finish(turn);
        return;
      }
      case "item/started": {
        const item = p.item as ThreadItem;
        items.set(item.id, item);
        itemStarted(item, cb, state);
        return;
      }
      case "item/completed": {
        const item = p.item as ThreadItem;
        items.set(item.id, item);
        if (item.type === "agentMessage") lastText = (item as Extract<ThreadItem, { type: "agentMessage" }>).text;
        const wasCompacting = state.compacting;
        itemCompleted(item, cb, state);
        // 手で頼んだ圧縮は、要約が済んだら終わり
        if (item.type === "contextCompaction" && compactOnly) finish({ id: turnId ?? "", status: "completed", error: null });
        else if (wasCompacting && !state.compacting && state.usage) cb.context?.(state.usage.last.totalTokens);
        return;
      }
      case "item/agentMessage/delta":
        if (retries > 0) {
          retries = 0;
          cb.retry?.(null);
        }
        cb.stream?.(String(p.delta ?? ""));
        return;
      case "item/commandExecution/outputDelta":
        commandOutputDelta(String(p.itemId), String(p.delta ?? ""), cb, state);
        return;
      case "thread/tokenUsage/updated":
        state.usage = p.tokenUsage as ThreadTokenUsage;
        return;
      case "error": {
        const error = p.error as TurnError;
        if (p.willRetry) cb.retry?.({ attempt: ++retries, max_retries: 0, retry_delay_ms: 0, at: new Date().toISOString() });
        else lastError = error;
        return;
      }
    }
  };

  const { args, env } = appServerLaunch(deps.baseEnv, params);
  const onAbort = () => {
    if (rpc && threadId && turnId) void rpc.request("turn/interrupt", { threadId, turnId }).catch(() => {});
    setTimeout(() => finish({ id: turnId ?? "", status: "interrupted", error: null }), INTERRUPT_GRACE_MS).unref?.();
  };
  try {
    rpc = await openSession({
      spawn: deps.spawn,
      args,
      env,
      cwd: params.cwd,
      onNotification,
      onServerRequest: createApprovalHandler({ params, guard: { params, self: deps.self }, cb, signal, items, steer }),
      onClosed: (reason) => finish({ id: turnId ?? "", status: "failed", error: { message: reason, codexErrorInfo: null, additionalDetails: null } }),
    });
    const overrides = threadOverrides(params);
    if (compactOnly && !threadId) return { status: "failed", sessionId: null, error: "まだ圧縮する会話がありません" };
    const opened = threadId
      ? await rpc.request<ThreadResponse>("thread/resume", { ...overrides, threadId, excludeTurns: true } satisfies ThreadResumeParams)
      : await rpc.request<ThreadResponse>("thread/start", overrides satisfies ThreadStartParams);
    threadId = opened.thread.id;
    cb.emit({ type: "init", session_id: threadId, model: opened.model, permission_mode: params.permissionMode, effort: codexEffort(params.effort) });
    signal.addEventListener("abort", onAbort, { once: true });
    if (compactOnly) {
      state.manualCompact = true;
      await rpc.request("thread/compact/start", { threadId });
    } else {
      const started = await rpc.request<{ turn: Turn }>("turn/start", {
        threadId,
        input: turnInput(params),
        clientUserMessageId: params.promptId ?? null,
        approvalPolicy: "untrusted",
        sandboxPolicy: codexSandboxPolicy(params),
        model: params.model,
        effort: codexEffort(params.effort),
      } satisfies TurnStartParams);
      turnId ??= started.turn.id;
      for (const text of pendingSteers.splice(0)) steerNow(text);
      cb.control?.({ tell: (text, uuid) => steerNow(text, uuid), stopTask: async () => {} });
    }
    const turn = await done;
    return turnResult(turn, threadId, state.usage, lastText, lastError);
  } catch (e) {
    const message = errorMessage(e);
    return { status: signal.aborted ? "cancelled" : "failed", sessionId: threadId, error: message, ...(isNetworkError(message) ? { network: true } : {}) };
  } finally {
    signal.removeEventListener("abort", onAbort);
    cb.control?.(null);
    if (state.compacting) cb.compacting?.(false);
    rpc?.close();
  }
}
