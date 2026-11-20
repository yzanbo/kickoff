import { errorMessage } from "@shared/foundation/errors";
import { isNetworkError } from "@shared/ai/networkErrors";
import { isUsageLimitError } from "@/features/ai/core/providers/shared/usageLimit";
import type { SelfInfo } from "@/features/guard/core/guard/selfProtection";
import { StdioRpc, type StdioSpawn } from "@/features/ai/core/providers/stdioRpc";
import type { ApprovalContext } from "@/features/ai/core/providers/guardedApproval";
import type { ProviderCallbacks, ProviderTurnParams, ProviderTurnResult } from "@/features/ai/core/providers/types";
import type { ProviderId } from "@shared/settings/types";
import { configChoices, launchEnv, modeFor, promptBlocks, sessionRequest } from "./config";
import { answerPermission } from "./permissions";
import { ACP_PROTOCOL_VERSION, type ContentBlock, type InitializeResponse, type RequestPermissionRequest, type SessionNotification, type SessionResponse, type StopReason } from "./protocol";
import { createUpdateState, flushText, sessionUpdate } from "./updates";

/** 止めたあと、エージェントが指示の終わりを返すまで待つ長さ（過ぎたらエージェントごと止める） */
const CANCEL_GRACE_MS = 5000;
/** 断った理由だけを伝え直す回数の上限（1 回の実行で。伝えるたびに AI が続けて断られ続けるのを防ぐ） */
const MAX_DENIAL_FOLLOWUPS = 3;

/** CLI ごとの違い（cursor/・gemini/ が決める） */
export interface AcpAgentSpec {
  /** AI の ID（詰まりの見張りの名前にも使う） */
  id: ProviderId;
  label: string;
  /** 起動の引数（"acp" など） */
  args(params: Pick<ProviderTurnParams, "auth">): string[];
  /** 鍵の環境変数（サブスクでは外す）と、API キーを入れる変数（なければ null） */
  keys: { keyVars: string[]; apiKeyVar: string | null };
  /** authenticate で使う方法の ID（エージェントが出した一覧にあるときだけ呼ぶ。null なら呼ばない） */
  authMethod(params: Pick<ProviderTurnParams, "auth">): string | null;
  /** 動かせない理由（API キーが要るのにないなど。なければ null） */
  authProblem?(params: Pick<ProviderTurnParams, "auth">): string | null;
  /** CLI 独自の頼み（Cursor の cursor/ask_question など）。答えなければ undefined */
  extension?(method: string, params: unknown, ctx: ApprovalContext): Promise<unknown> | undefined;
}

export interface AcpTurnDeps {
  spawn: StdioSpawn;
  spec: AcpAgentSpec;
  baseEnv: Record<string, string | undefined>;
  self?: SelfInfo;
}

const CLIENT_INFO = { name: "kickoff", title: "Kickoff", version: "0.1.0" };
/** Kickoff はファイルの読み書き・端末をエージェントに貸さない（エージェントが自分のツールで行い、権限の頼みで守りを当てる） */
const CLIENT_CAPABILITIES = { fs: { readTextFile: false, writeTextFile: false }, terminal: false };

/** エージェントを起動して initialize（と、要れば authenticate）まで済ませる */
export async function openAgent(
  deps: Pick<AcpTurnDeps, "spawn" | "spec">,
  opts: { env: Record<string, string | undefined>; cwd: string; params: Pick<ProviderTurnParams, "auth">; onNotification?: (method: string, params: unknown) => void; onServerRequest?: (method: string, params: unknown) => Promise<unknown>; onClosed?: (reason: string) => void },
): Promise<{ rpc: StdioRpc; init: InitializeResponse }> {
  const proc = deps.spawn(deps.spec.args(opts.params), { env: opts.env, cwd: opts.cwd });
  const refuse = async (method: string) => {
    throw new Error(`Kickoff は ${method} に答えません`);
  };
  const rpc = new StdioRpc(proc, opts.onNotification ?? (() => {}), opts.onServerRequest ?? refuse, opts.onClosed, { label: deps.spec.label, provider: deps.spec.id, jsonrpc: true });
  try {
    const init = await rpc.request<InitializeResponse>("initialize", { protocolVersion: ACP_PROTOCOL_VERSION, clientCapabilities: CLIENT_CAPABILITIES, clientInfo: CLIENT_INFO });
    const method = deps.spec.authMethod(opts.params);
    if (method && (init.authMethods ?? []).some((m) => m.id === method)) await rpc.request("authenticate", { methodId: method });
    return { rpc, init };
  } catch (e) {
    rpc.close();
    throw e;
  }
}

/** 指示の終わりの理由を Kickoff の結果にする */
function stopResult(stop: StopReason, sessionId: string, state: { lastText: string; usage: { used: number; size: number } | null; costUsd: number | undefined }): ProviderTurnResult {
  const context = state.usage ? { context: { tokens: state.usage.used, window: state.usage.size } } : {};
  const cost = state.costUsd !== undefined ? { costUsd: state.costUsd } : {};
  if (stop === "cancelled") return { status: "cancelled", sessionId, ...context, ...cost };
  if (stop === "refusal") return { status: "failed", sessionId, error: "AI が続けるのを断りました", ...context, ...cost };
  return { status: "completed", sessionId, result: state.lastText, ...context, ...cost };
}

/**
 * 1 回の実行（initialize → session/new か続き（session/resume、なければ session/load）→ session/prompt → 終わりの理由）。
 * ACP には作業中に発言を足す口がないので、control.tell と断った理由は預かり、いまの指示が終わったら同じ実行の中で次の指示として送る
 */
export async function runAcpTurn(deps: AcpTurnDeps, params: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult> {
  if (signal.aborted) return { status: "cancelled", sessionId: params.resumeSessionId };
  const problem = deps.spec.authProblem?.(params);
  if (problem) return { status: "failed", sessionId: params.resumeSessionId, error: problem };
  const tools = params.tools ?? [];
  const state = createUpdateState(tools.map((t) => t.name));
  const tells: string[] = [];
  const denials: string[] = [];
  let sessionId: string | null = params.resumeSessionId;
  let loading = false;
  let rpc: StdioRpc | null = null;
  let closedReason: string | null = null;
  let cancelled!: () => void;
  const cancelledNow = new Promise<"cancelled">((resolve) => (cancelled = () => resolve("cancelled")));
  const approval: ApprovalContext = { params, cb, signal };

  const onNotification = (method: string, raw: unknown) => {
    if (method !== "session/update" || loading) return; // session/load は会話を流し直すので読み飛ばす
    const p = raw as SessionNotification;
    if (sessionId && p.sessionId !== sessionId) return;
    sessionUpdate(p.update as Record<string, unknown> & { sessionUpdate: string }, cb, state);
  };
  const onServerRequest = async (method: string, raw: unknown) => {
    if (method === "session/request_permission") {
      return answerPermission({ ...approval, guard: { params, self: deps.self }, tools, denied: (note) => denials.push(note) }, raw as RequestPermissionRequest);
    }
    const handled = deps.spec.extension?.(method, raw, approval);
    if (handled) return handled;
    throw new Error(`Kickoff は ${method} に対応していません`);
  };
  const onAbort = () => {
    if (rpc && sessionId) rpc.notify("session/cancel", { sessionId });
    setTimeout(cancelled, CANCEL_GRACE_MS).unref?.();
  };

  try {
    const opened = await openAgent(deps, { env: launchEnv(deps.baseEnv, params, deps.spec.keys), cwd: params.cwd, params, onNotification, onServerRequest, onClosed: (reason) => (closedReason = reason) });
    rpc = opened.rpc;
    const caps = opened.init.agentCapabilities;
    const base = sessionRequest(params, caps);
    let fresh = !sessionId;
    let session: SessionResponse;
    if (sessionId && caps?.sessionCapabilities?.resume) {
      session = await rpc.request<SessionResponse>("session/resume", { ...base, sessionId });
    } else if (sessionId && caps?.loadSession) {
      loading = true;
      session = await rpc.request<SessionResponse>("session/load", { ...base, sessionId }).finally(() => (loading = false));
    } else {
      if (sessionId) cb.emit({ type: "notice", message: `${deps.spec.label} は会話の続きに対応していないので、新しい会話で始めました` });
      session = await rpc.request<SessionResponse>("session/new", base);
      sessionId = session.sessionId ?? null;
      fresh = true;
    }
    if (!sessionId) throw new Error(`${deps.spec.label} がセッションの ID を返しませんでした`);
    const id: string = sessionId;
    cb.emit({ type: "init", session_id: id, ...(params.model ? { model: params.model } : {}), permission_mode: params.permissionMode, effort: params.effort });
    const mode = session.modes ? modeFor(session.modes.availableModes, params.permissionMode) : null;
    if (mode && mode !== session.modes?.currentModeId) await rpc.request("session/set_mode", { sessionId: id, modeId: mode });
    for (const choice of configChoices(session.configOptions ?? [], params)) await rpc.request("session/set_config_option", { sessionId: id, ...choice }).catch(() => {});

    signal.addEventListener("abort", onAbort, { once: true });
    state.manualCompact = params.prompt.trim() === "/compact";
    cb.control?.({ tell: (text) => (tells.push(text), true), stopTask: async () => {} });
    let prompt: ContentBlock[] = promptBlocks(params, { withSystemPrompt: fresh && !caps?.sessionCapabilities?.systemPrompt });
    let denialRounds = 0;
    let stop: StopReason = "end_turn";
    for (;;) {
      const res = await Promise.race([rpc.request<{ stopReason: StopReason }>("session/prompt", { sessionId: id, prompt }), cancelledNow]);
      flushText(cb, state);
      stop = res === "cancelled" ? "cancelled" : res.stopReason;
      if (stop === "cancelled" || signal.aborted) break;
      const told = tells.splice(0);
      const notes = denials.splice(0);
      if (told.length === 0 && (notes.length === 0 || denialRounds >= MAX_DENIAL_FOLLOWUPS)) break;
      if (told.length === 0) denialRounds++;
      prompt = [...notes, ...told].map((t) => ({ type: "text", text: t }));
    }
    if (signal.aborted) stop = "cancelled";
    if (stop === "max_tokens" || stop === "max_turn_requests") cb.emit({ type: "notice", message: `${deps.spec.label} が上限（${stop}）で止まりました` });
    return stopResult(stop, id, state);
  } catch (e) {
    const message = closedReason ?? errorMessage(e);
    const usageLimit = isUsageLimitError(message);
    return {
      status: signal.aborted ? "cancelled" : "failed",
      sessionId,
      error: message,
      ...(!usageLimit && isNetworkError(message) ? { network: true } : {}),
      ...(usageLimit ? { usageLimit: { resetsAt: null } } : {}),
    };
  } finally {
    signal.removeEventListener("abort", onAbort);
    cb.control?.(null);
    if (state.compacting) cb.compacting?.(false);
    rpc?.close();
  }
}
