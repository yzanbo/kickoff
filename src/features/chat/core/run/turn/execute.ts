// 1 回の実行: 作業場所を決めて PATH を待ち、プロバイダーを動かして（AI のツールの口を開け閉めし、引き継ぎの印を取る）、結果をチャットに反映する
import { shellPathSettled } from "@/foundation/core/system/exec";
import { systemClock } from "@/foundation/core/clock";
import { errorMessage } from "@shared/foundation/errors";
import { currentBranch } from "@/foundation/core/workplace/reads";
import { networkStoppedSubagents } from "@shared/chat/subagents";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { CompactTrigger } from "@shared/ai/turnEvents";
import { PROVIDER_AUTH_MODE_LABELS } from "@shared/settings/types";
import { providerCan } from "@shared/ai/providers";
import type { McpToolHost } from "@/foundation/core/aiTools/host";
import { AiToolRegistry } from "@/foundation/core/aiTools/registry";
import { resolveWorkdir } from "@/features/chat/core/turnFolders";
import { CHAT_TOOLS_HEAD, chatToolGroups } from "@/features/chat/core/tools/chatTools";
import { aiTurnOf } from "@/features/chat/core/tools/aiTurn";
import { knownModel, postCompactPromptOf, preCompactPromptOf, retryProviderHandoffPreparation, TurnSandboxDiagnostics, type ExecutionDeps, type ProviderTurnParams, type ProviderTurnResult, type TurnRequest } from "@/features/chat/core/turn";
import { recordEvent } from "@/features/chat/core/run/record";
import type { TurnOutcome } from "@/features/chat/core/run/machine/types";
import type { ChatRun } from "@/features/chat/core/run/chatRun";
import type { TurnEndInfo } from "./contributor";
import { collectTurnParts, legacyTurnParts, toProviderParams, type CollectedParts } from "./params";
import { chatTurnParts } from "./chatParts";
import { appendSections } from "@/features/chat/core/prompt/compose";
import { callbacksFor } from "./providerEvents";
import { applyResult } from "./result";

/**
 * 1 回の実行を最後まで進める: 作業場所を決めてプロバイダーを動かし、結果をチャットに反映する。作業中の様子（裏の作業・再試行・圧縮中・作業中のチャットへの操作）は
 * チャットの run に書く（画面には殻が配る）。失敗はチャットの失敗として記録する（投げない）。中断は signal で伝わる
 */
export async function executeTurn(deps: ExecutionDeps, runtime: ChatRun, { chatId, prompt, promptId, compact = false, compactTrigger, claimedHandoffEventId }: TurnRequest, signal: AbortSignal): Promise<TurnOutcome> {
  const { store, providers } = deps;
  const handoff = store.chatProviderHandoffs.get(chatId);
  let handoffClaimed = false;
  // 作業した場所と、始めたときのブランチ（調べ終える前に失敗した・Git でない・ブランチから外れていれば null）
  let turnDir: string | null = null;
  // この実行より前の記録（止まったサブエージェントを、この実行の分だけ数えるため）
  let since = 0;
  // 登録した contributor が出した作業の終わりにすること（集める前に失敗したら何もしない。1 回だけ）
  let afterTurn: CollectedParts["afterTurn"] = [];
  const endTurn = async (end: Omit<TurnEndInfo, "chatId" | "since" | "cwd">) => {
    const fns = afterTurn;
    afterTurn = [];
    for (const fn of fns) await fn({ chatId, since, cwd: turnDir!, ...end }).catch((e: unknown) => console.warn(`[turn] 作業の終わりにすることが失敗しました: ${errorMessage(e)}`));
  };
  /**
   * 作業の途中で AI がブランチを替えていたら、最後に作業したブランチを覚え直す（結果を書く前に。外れていれば・読めなければ前のまま）。
   * 始めにブランチから外れていても、作業中にブランチを取り出すことがあるので読み直す。
   */
  const rememberEndBranch = async () => {
    const branch = turnDir ? await currentBranch(turnDir) : null;
    const chat = store.chats.get(chatId);
    if (branch && chat && branch !== chat.branch) store.chats.update(chatId, { branch });
  };
  try {
    // エージェントの CLI は、ログインシェルの PATH を読み直し終えてから起こす（コアのプロセスの起動の直後だけ待つ。system/exec.ts）
    await shellPathSettled();
    const chat = store.chats.get(chatId)!;
    const project = store.projects.get(chat.project_id)!;
    const cwd = await resolveWorkdir(chat, project);
    turnDir = cwd;
    // 作業しているブランチを覚えておく（ワークツリーを片付けたあとも、どのブランチの作業だったか分かるように。外れていれば前のまま）。
    // 送ったので、ワークツリーを片付けた印は外す（札はもとから本体。説明に片付けたブランチを添えるのは次に送るまで）
    const branch = await currentBranch(cwd);
    store.chats.update(chatId, { turn_started_at: (deps.clock ?? systemClock).iso(), finished_worktree_branch: null, ...(branch ? { branch } : {}) });
    since = store.events.latestId(chatId) ?? 0;
    // 上限に近づいて自動で圧縮する前に足す圧縮前指示（手で圧縮する実行には足さない）
    const preCompactText = compact ? null : preCompactPromptOf(store, project);
    // 圧縮したら（手で・自動のどちらも）、預かった指示より先に送る圧縮後指示
    const postCompactText = postCompactPromptOf(store, project);
    // 計画モードと「AI で整える」の専用の保護は、アプリの既定にかかわらず維持する（砂場なしにできない AI は動かさない）
    const useSandbox = chat.sandbox_enabled || chat.permission_mode === "plan" || chat.untracked_only;
    if (!useSandbox && !providerCan(chat.provider, "sandbox_off")) throw new Error("この AI は、Kickoff からサンドボックスをオフにする設定にまだ対応していません");

    // 動かし始める前（作業場所・ブランチを調べている間）に止められたら、プロバイダーを動かさずに中断で終える（中断済みの signal には abort の知らせが来ない）
    const result: ProviderTurnResult = signal.aborted ? { status: "cancelled", sessionId: chat.session_id } : await runProvider();
    async function runProvider(): Promise<ProviderTurnResult> {
      // ログインの仕方（API キーにしたのに置いていない・開けなければ、動かさずに分かる文で止める）
      const auth = (await deps.providerKeys?.authFor(chat.provider)) ?? { mode: "subscription" as const, apiKey: null };
      if (auth.mode === "api_key" && !auth.apiKey) throw new Error(`${providers[chat.provider].label} のログインの仕方が「${PROVIDER_AUTH_MODE_LABELS.api_key}」ですが、API キーを読めませんでした。設定の AI の欄で API キーを置き直してください`);
      // その AI のモデルの一覧にない名前（ほかの AI のモデルなど）は外し、その AI の既定で動かす。チャットにも直して残す
      const model = await knownModel(chat.provider, providers[chat.provider], chat.model);
      if (model !== chat.model) store.chats.update(chatId, { model });
      const recorded: ((event: ChatEvent) => void)[] = [];
      const callbacks = callbacksFor(deps, runtime, chat, signal, compact, compactTrigger ?? compactTriggerOf(prompt, compact), { pre: preCompactText, post: postCompactText }, (event) => recorded.forEach((fn) => fn(event)));
      // 実行に足すもの（まだ機能へ分けていない組み立てと、上の機能が登録した contributor）を order の順に集める
      const phase = runtime.run.phase;
      const kind = phase.kind === "turn" ? phase.turn : compact ? "compact" : "message";
      const parts = await collectTurnParts([legacyTurnParts(deps, runtime, preCompactText), chatTurnParts(deps, runtime), ...(deps.contributors ?? [])], { chat, project, cwd, kind, signal, requestApproval: callbacks.requestApproval });
      recorded.push(...parts.onRecord);
      afterTurn = parts.afterTurn;
      const params: ProviderTurnParams = toProviderParams(chat, parts, {
        cwd,
        prompt,
        promptId,
        model,
        compact: compact || prompt.trim() === "/compact", // 手で頼んだ圧縮（送信待ちの圧縮の行・チャット欄に書いた /compact）
        autoCompactPct: store.settings.get().auto_compact_pct,
        auth,
        cb: callbacks,
        signal,
      });
      const initialContext = params.turnContext ?? null;
      if (handoff) {
        if (compact || (handoff.state !== "ready" && !(handoff.state === "sending" && handoff.eventId === claimedHandoffEventId)) || handoff.provider !== chat.provider) throw new Error("AI の引き継ぎを確認するまで、この操作はできません");
        params.turnContext = appendSections(params.turnContext ?? null, handoff.context);
      }
      const diagnostics = deps.sandboxDiagnostics && providerCan(chat.provider, "sandbox_diagnostics") ? new TurnSandboxDiagnostics(deps.sandboxDiagnostics) : null;
      params.onAgentSpawned = diagnostics?.onSpawn;
      const closeDiagnostics = () => diagnostics?.close();
      signal.addEventListener("abort", closeDiagnostics, { once: true });
      if (signal.aborted) closeDiagnostics();
      // AI の操作ツールは、この実行の鍵でコアの MCP サーバーに出し、プロバイダーにはその口だけを渡す（どの CLI でも同じツール。終わったら鍵を捨てる）
      let tools: ReturnType<McpToolHost["open"]> | null = null;
      try {
        // chat の組と、上の機能が出した組（通知・DB・ブラウザ）を、レジストリが order の順に並べて作業ごとに開く
        const registry = new AiToolRegistry([...chatToolGroups(deps, diagnostics), ...(deps.aiTools ?? [])]);
        tools = deps.toolHost?.open(registry.serversFor(aiTurnOf(chat, cwd, callbacks.requestApproval, signal), { kickoff_chat: CHAT_TOOLS_HEAD })) ?? null;
        const endpoints = tools?.endpoints ?? [];
        // 登録した contributor の包み（引き継ぎの印・診断の開け閉め）の中でプロバイダーを動かす
        return await parts.around(async () => {
          if (handoff) {
            if (claimedHandoffEventId === handoff.eventId) {
              const current = store.chatProviderHandoffs.get(chatId);
              if (!current || current.eventId !== handoff.eventId || current.provider !== chat.provider || current.state !== "sending") throw new Error("AI の引き継ぎ状態が変わったため、送信を中止しました");
            } else if (!store.chatProviderHandoffs.claim(chatId, handoff.eventId, chat.provider)) throw new Error("AI の引き継ぎ状態が変わったため、送信を中止しました");
            handoffClaimed = true;
          }
          const first = await providers[chat.provider].run({ ...params, tools: endpoints }, callbacks, signal);
          if (!handoff || !first.resumeSessionMissing || first.status !== "failed" || !chat.session_id || first.sessionId !== chat.session_id || signal.aborted) return first;
          // 「再開要求の段階で履歴がない」と確定した場合は、まだ利用者の指示は送られていない。
          if (!store.providerSwitch.markSessionMissing(chatId, handoff.eventId, chat.provider, chat.session_id)) throw new Error("AI のセッション状態が変わったため再開を中止しました");
          handoffClaimed = false;
          recordEvent(store, runtime, { type: "notice", message: "以前の AI のセッションが見つからなかったため、新しいセッションを作ります。以前のセッションにしかない文脈は引き継げません。" });
          if (!deps.uploads) throw new Error("添付の保存先がないため、会話の引き継ぎを準備できません");
          // 再準備と送信中の印を同時に保存する。終了が割り込んでも、元の指示を飛ばして次へ進まない。
          const retry = await retryProviderHandoffPreparation({ store, uploads: deps.uploads, requireIdle: () => {} }, chatId, true);
          handoffClaimed = true;
          if (retry.warning) recordEvent(store, runtime, { type: "notice", message: retry.warning });
          if (signal.aborted) throw new Error("新しいセッションの準備中に中断しました");
          const prepared = store.chatProviderHandoffs.get(chatId);
          if (!prepared || prepared.eventId !== handoff.eventId || prepared.state !== "sending") throw new Error("AI の引き継ぎ状態が変わったため再開を中止しました");
          return await providers[chat.provider].run({ ...params, resumeSessionId: null, turnContext: appendSections(initialContext, prepared.context), tools: endpoints }, callbacks, signal);
        });
      } finally {
        signal.removeEventListener("abort", closeDiagnostics);
        diagnostics?.close();
        tools?.close();
      }
    }
    const network = result.status === "failed" && Boolean(result.network);
    await rememberEndBranch();
    applyResult(store, runtime, result, compact, since, network);
    if (handoff) {
      if (handoffClaimed && result.status === "completed" && result.sessionId) {
        const last = store.events.recent(chatId, 1)[0];
        if (!last || last.type !== "result" || !store.providerSwitch.complete(chatId, handoff.eventId, handoff.provider, result.sessionId)) {
          store.chatProviderHandoffs.markUncertain(chatId, handoff.eventId, "AI の引き継ぎ完了を確認できませんでした");
        }
      } else if (handoffClaimed) {
        store.chatProviderHandoffs.markUncertain(chatId, handoff.eventId, result.error ?? "AI が指示を受け取ったか確認できません");
      } else {
        const reason = result.error ?? "AI に引き継ぐ前に作業が止まりました";
        if (claimedHandoffEventId === handoff.eventId) store.chatProviderHandoffs.blockBeforeSend(chatId, handoff.eventId, reason);
        else store.chatProviderHandoffs.blockReady(chatId, handoff.eventId, reason);
      }
    }
    // 作業の終わりにすること（圧縮した作業の会話記録の乗り換えなど。登録した contributor の afterTurn）
    await endTurn({ status: result.status, network });
    const usageLimit = result.status === "failed" && !network ? result.usageLimit : undefined;
    if (!network) return { status: result.status, network, ...(usageLimit ? { usageLimit } : {}) };
    const stoppedAgents = networkStoppedSubagents(store.events.forSubagents(chatId), since).map((s) => ({ agentId: s.agentId!, description: s.description }));
    return { status: result.status, network, stoppedAgents };
  } catch (e) {
    const message = errorMessage(e);
    if (handoff) {
      if (handoffClaimed) store.chatProviderHandoffs.markUncertain(chatId, handoff.eventId, message);
      else if (claimedHandoffEventId === handoff.eventId) store.chatProviderHandoffs.blockBeforeSend(chatId, handoff.eventId, message);
      else store.chatProviderHandoffs.blockReady(chatId, handoff.eventId, message);
    }
    await rememberEndBranch();
    store.chats.update(chatId, { error: message, unread: true }); // 失敗も、見るまでは未読にする（状態 failed は作業していないに戻ったときに殻が書く）
    recordEvent(store, runtime, { type: "error", message });
    await endTurn({ status: "failed", network: false });
    return { status: "failed", network: false };
  }
}

/**
 * この実行の中の圧縮のきっかけ: 手で圧縮した（圧縮のボタン = compact、チャット欄から /compact を送った）なら manual、ほかの指示の途中で起きた圧縮は、コンテキストが上限に近づいて Claude Code が自動で始めたもの
 */
function compactTriggerOf(prompt: string, compact: boolean): CompactTrigger {
  return compact || /^\/compact(?:\s|$)/.test(prompt.trimStart()) ? "manual" : "auto";
}

/** 次に送るものに一度だけ添える知らせを取り出す（取り出したら外す。利用者が作業場所を移す予約を取り消したときなど） */
export function takePendingNote(runtime: ChatRun): string | null {
  const note = runtime.pendingNote;
  runtime.pendingNote = null;
  return note;
}
