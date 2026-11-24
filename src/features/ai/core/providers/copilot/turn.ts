import { errorMessage } from "@shared/foundation/errors";
import { isNetworkError } from "@shared/ai/networkErrors";
import { createStopper, failureFlags, type Stopper } from "@/features/ai/core/providers/shared/turnLifecycle";
import { setCompacting } from "@/features/ai/core/providers/shared/events";
import type { ProviderCallbacks, ProviderTurnParams, ProviderTurnResult } from "@/features/ai/core/providers/types";
import { byokProvider, copilotSandbox, mcpServersOf, runtimeEnv, turnPrompt } from "./config";
import { createEventState, handleEvent, type EventState } from "./events";
import { noteSyncSince, syncStart } from "@/foundation/core/system/stallWatch";
import { createPermissionHandler, createPreToolUseHook, createUserInputHandler } from "./permissions";
import type { CopilotClientFactory, CopilotClientLike, CopilotSessionLike, SessionConfig } from "./sdk";
import { CLIENT_INFO } from "@/features/ai/core/providers/shared/process";

export interface TurnDeps {
  clientFactory: CopilotClientFactory;
  /** ランタイムに渡す環境変数の元（process.env） */
  baseEnv: Record<string, string | undefined>;
}

/** 手を空けたときの結果 */
export function turnResult(state: EventState, sessionId: string, aborted: boolean): ProviderTurnResult {
  const context = state.usage ? { context: { tokens: state.usage.tokens, window: state.usage.window } } : {};
  if (aborted) return { status: "cancelled", sessionId, ...context };
  if (state.error) {
    // 失敗の種類が使用枠の上限か（Copilot の errorType: rate_limit = 回数の上限・quota = プレミアムリクエストの枠）
    const limit = state.error.type === "rate_limit" || state.error.type === "quota";
    return { status: "failed", sessionId, error: state.error.message, ...context, ...failureFlags(state.error.message, { usageLimit: limit }) };
  }
  return { status: "completed", sessionId, result: state.lastText, ...(state.lastEventId ? { lastMessageId: state.lastEventId } : {}), ...context };
}

/** セッションの設定（作るときと続けるときで同じ。続けるときも砂場・MCP・承認の口は渡し直す） */
function sessionConfig(params: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal): SessionConfig {
  const deps = { params, cb, signal };
  const byok = byokProvider(params.auth, params.model);
  const model = byok?.model ?? params.model;
  const sandbox = copilotSandbox(params);
  const tools = params.tools ?? [];
  return {
    clientName: CLIENT_INFO.title,
    workingDirectory: params.cwd,
    additionalDirectories: params.additionalDirectories,
    streaming: true,
    permissionMode: "manual",
    onPermissionRequest: createPermissionHandler(deps),
    onUserInputRequest: createUserInputHandler(deps),
    hooks: { onPreToolUse: createPreToolUseHook(deps) },
    ...(model ? { model } : {}),
    ...(params.effort ? { reasoningEffort: params.effort } : {}),
    ...(params.systemPrompt ? { systemMessage: { content: params.systemPrompt } } : {}),
    ...(tools.length > 0 ? { mcpServers: mcpServersOf(tools) } : {}),
    ...(sandbox ? { sandboxConfig: sandbox } : {}),
    ...(byok ? { provider: byok.provider } : {}),
  };
}

/**
 * 1 回の実行（ランタイムを起こす → セッションを作る / 続ける → 送る → 手が空いたら（session.idle）結果）。
 * 作業中に足す発言は send の immediate（control.tell）、止めるのは abort。チャット欄の /compact は history.compact
 */
export async function runCopilotTurn(deps: TurnDeps, params: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult> {
  if (signal.aborted) return { status: "cancelled", sessionId: params.resumeSessionId };
  const compactOnly = params.compact;
  if (compactOnly && !params.resumeSessionId) return { status: "failed", sessionId: null, error: "まだ圧縮する会話がありません" };
  const state = createEventState();
  let client: CopilotClientLike | null = null;
  let session: CopilotSessionLike | null = null;
  let sessionId = params.resumeSessionId;
  let started = false;
  let compacts = 0;
  let finish!: (aborted: boolean) => void;
  const done = new Promise<boolean>((resolve) => (finish = resolve));

  // 止めたら abort。手が空かなければ（session.idle が来なければ）、待ったあとに中断で返す
  let stopper: Stopper | null = null;
  try {
    client = deps.clientFactory({ env: runtimeEnv(deps.baseEnv, params.env), cwd: params.cwd });
    const pid = await client.start();
    if (pid !== null) params.onAgentSpawned?.(pid);
    const config = sessionConfig(params, cb, signal);
    session = sessionId ? await client.resumeSession(sessionId, config) : await client.createSession(config);
    sessionId = session.sessionId;
    session.on((event) => {
      if (event.type === "user.message" || event.type === "assistant.turn_start" || event.type === "session.error") started = true;
      if (event.type === "session.compaction_complete" && event.data.success) compacts++;
      // 1 件の処理に名前を付けて詰まりの見張りに知らせる（system/stallWatch.ts）
      const start = syncStart();
      handleEvent(event, cb, state);
      noteSyncSince(start, () => `provider:copilot:${event.type}`);
      // 送る前の手の空き（続けたときの知らせなど）は数えない
      if (event.type === "session.idle" && started) finish(Boolean(event.data.aborted));
    });
    cb.emit({ type: "init", session_id: sessionId, ...(config.model ? { model: config.model } : {}), permission_mode: params.permissionMode, effort: params.effort });
    stopper = createStopper(signal, { interrupt: () => void session?.abort().catch(() => {}), onForced: () => finish(true) });
    // 起動の途中（ここまで）で止められていたら、指示を送らずに中断で返す
    if (signal.aborted) return { status: "cancelled", sessionId };

    if (compactOnly) {
      setCompacting(state, cb, true);
      const before = state.usage?.tokens ?? 0;
      const res = await session.compact();
      // SDK が圧縮の知らせを出さなかったときだけ、ここで記録を残す
      if (res.success && compacts === 0) cb.emit({ type: "compact", trigger: "manual", pre_tokens: before });
      if (!res.success) cb.compactFailed?.(null);
      return { status: res.success ? "completed" : "failed", sessionId, ...(res.success ? {} : { error: "会話を圧縮できませんでした" }) };
    }

    const active = session;
    await active.send({ prompt: turnPrompt(params) });
    started = true;
    cb.control?.({
      tell: (text) => {
        void active.send({ prompt: text, mode: "immediate" }).catch(() => {});
        return true;
      },
      stopTask: async () => {},
    });
    const aborted = (await done) || signal.aborted;
    return turnResult(state, sessionId, aborted);
  } catch (e) {
    const message = errorMessage(e);
    return { status: signal.aborted ? "cancelled" : "failed", sessionId, error: message, ...(isNetworkError(message) ? { network: true } : {}) };
  } finally {
    stopper?.dispose();
    cb.control?.(null);
    if (state.compacting) cb.compacting?.(false);
    await session?.disconnect().catch(() => {});
    await client?.stop().catch(() => {});
  }
}
