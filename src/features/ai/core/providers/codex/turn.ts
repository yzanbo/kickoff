import { errorMessage } from "@shared/foundation/errors";
import { isNetworkError } from "@shared/ai/networkErrors";
import { createStopper, failureFlags, type Stopper } from "@/features/ai/core/providers/shared/turnLifecycle";
import type { SelfInfo } from "@/features/guard/core/guard/selfProtection";
import type { ProviderCallbacks, ProviderTurnParams, ProviderTurnResult } from "@/features/ai/core/providers/types";
import { createApprovalHandler } from "./approvals";
import { appServerLaunch, CODEX_APPROVAL_POLICY, codexEffort, codexSandboxPolicy, threadOverrides, turnInput } from "./config";
import { startHookServer, type HookServer } from "./hookServer";
import { assertHookActive, kickoffHookTrust, withHookTrust } from "./hookTrust";
import { commandOutputDelta, createItemState, itemCompleted, itemStarted } from "./items";
import { creditsNoteOf } from "./catalog";
import type { CodexErrorInfo, RateLimitsUpdatedNotification, ThreadItem, ThreadResponse, ThreadResumeParams, ThreadStartParams, ThreadTokenUsage, Turn, TurnError, TurnStartParams, TurnSteerParams } from "./protocol";
import { StdioRpcError, type StdioRpc, type StdioSpawn } from "@/features/ai/core/providers/stdioRpc";
import { createPreToolUseHandler } from "./preToolUse";
import { openSession } from "./session";

/** app-server 0.169 の thread/resume が返す、対象 ID の履歴なしを示す応答だけを認める。 */
export function confirmedMissingResume(error: unknown, sessionId: string | null): boolean {
  return Boolean(sessionId && error instanceof StdioRpcError && error.method === "thread/resume" && error.code === -32600 && error.message === `no rollout found for thread id ${sessionId}`);
}

export interface TurnDeps {
  spawn: StdioSpawn;
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
  return {
    status: "failed",
    sessionId: threadId,
    error: error?.additionalDetails ? `${message}（${error.additionalDetails}）` : message,
    ...context,
    ...failureFlags(message, { usageLimit: error?.codexErrorInfo === "usageLimitExceeded", network: isNetworkInfo(error?.codexErrorInfo ?? null) }),
  };
}

/**
 * 1 回の実行（ProviderTurnParams → フックの口を開く → app-server の thread/start か thread/resume（フックを信頼した覚えごと）→ フックが有効かの確かめ
 * → turn/start → turn/completed）。作業中に足す発言は turn/steer（control.tell）、止めるのは turn/interrupt。チャット欄の /compact は thread/compact/start
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
  let rpc: StdioRpc | null = null;
  let hook: HookServer | null = null;
  const pendingSteers: string[] = [];
  // フックで利用者が許した書く先（あとで同じファイルの変更の承認が来ても聞き直さない）
  const approvedWrites = new Set<string>();
  const guard = { params, self: deps.self };
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
    // 使用枠の知らせはスレッドの ID を持たない（アカウントのもの）ので、自分のスレッドかを確かめる前に受ける。
    // クレジットの残りを渡し、減ったら（上限を超えてクレジットから引かれ始めたら）コアが知らせる
    if (method === "account/rateLimits/updated") {
      const note = creditsNoteOf((raw as RateLimitsUpdatedNotification | null)?.rateLimits);
      if (note) cb.credits?.(note);
      return;
    }
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

  // 止めたら turn/interrupt。終わりが返らなければ、待ったあとに中断で返す（app-server ごと止める）
  const interrupt = () => {
    if (rpc && threadId && turnId) void rpc.request("turn/interrupt", { threadId, turnId }).catch(() => {});
  };
  let stopper: Stopper | null = null;
  try {
    // 守りを当てる PreToolUse のフックの口（hooks.ts）。URL と鍵は app-server の環境で渡す
    hook = await startHookServer(createPreToolUseHandler({ params, guard, cb, signal, approvedWrites }));
    const { args, env } = appServerLaunch(deps.baseEnv, params, hook);
    rpc = await openSession({
      spawn: deps.spawn,
      args,
      env,
      cwd: params.cwd,
      onProcessSpawned: params.onAgentSpawned,
      onNotification,
      onServerRequest: createApprovalHandler({ params, guard, cb, signal, items, steer, approvedWrites }),
      onClosed: (reason) => finish({ id: turnId ?? "", status: "failed", error: { message: reason, codexErrorInfo: null, additionalDetails: null } }),
    });
    if (compactOnly && !threadId) return { status: "failed", sessionId: null, error: "まだ圧縮する会話がありません" };
    const base = threadOverrides(params);
    const overrides = withHookTrust(base, await kickoffHookTrust(rpc, base));
    const opened = threadId
      ? await rpc.request<ThreadResponse>("thread/resume", { ...overrides, threadId, excludeTurns: true } satisfies ThreadResumeParams)
      : await rpc.request<ThreadResponse>("thread/start", overrides satisfies ThreadStartParams);
    threadId = opened.thread.id;
    // 守りのフックが効いていなければ動かさない（守りなしで砂場の中のコマンドが流れるため）
    await assertHookActive(rpc, threadId);
    cb.emit({ type: "init", session_id: threadId, model: opened.model, permission_mode: params.permissionMode, effort: codexEffort(params.effort) });
    stopper = createStopper(signal, { interrupt, onForced: () => finish({ id: turnId ?? "", status: "interrupted", error: null }) });
    // 起動の途中（ここまで）で止められていたら、指示を送らずに中断で返す
    if (signal.aborted) return { status: "cancelled", sessionId: threadId };
    if (compactOnly) {
      state.manualCompact = true;
      await rpc.request("thread/compact/start", { threadId });
    } else {
      const started = await rpc.request<{ turn: Turn }>("turn/start", {
        threadId,
        input: turnInput(params),
        clientUserMessageId: params.promptId ?? null,
        approvalPolicy: CODEX_APPROVAL_POLICY,
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
    return { status: signal.aborted ? "cancelled" : "failed", sessionId: threadId, error: message, ...(!signal.aborted && confirmedMissingResume(e, params.resumeSessionId) ? { resumeSessionMissing: true as const } : {}), ...(isNetworkError(message) ? { network: true } : {}) };
  } finally {
    stopper?.dispose();
    cb.control?.(null);
    if (state.compacting) cb.compacting?.(false);
    rpc?.close();
    hook?.close();
  }
}
