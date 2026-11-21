import type { BrowserControl } from "@shared/browser/control";
import { knownModel } from "@/features/ai/core/providers/modelCatalog";
import { TurnSandboxDiagnostics } from "@/features/guard/core/sandboxDiagnostics";
import { shellPathSettled } from "@/foundation/core/system/exec";
import type { TerminalControl } from "@/features/terminal/core/control";
import { hiddenDbTargets } from "@/features/database/core/hiddenTargets";
import { createDockerGuard } from "@/features/docker/core/guardFacts";
import type { DockerService } from "@/features/docker/core/service";
import type { WorktreeEnvService } from "@/features/worktrees/core/env/service";
import type { DatabaseService } from "@/features/database/core/service";
import type { WorktreeFinisher } from "@/features/worktrees/core/finish";
import type { UserViewRegistry } from "@/features/userView/core/registry";
import { githubEnvForGit, runAsGitHubAccount } from "@/features/github/core/githubAccount";
import { mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ApprovalCenter } from "./approvals";
import { chosenPreviews } from "@shared/chat/questionPreviews";
import { isUnreadEvent } from "@shared/chat/state";
import type { Bus } from "@/foundation/core/bus";
import { errorMessage } from "@shared/foundation/errors";
import { currentBranch } from "@/foundation/core/workplace/reads";
import { isInside, realPathOrSelf } from "@/foundation/core/system/paths";
import { workplacesOf } from "@/foundation/core/workplace/worktrees";
import { buildSystemPrompt, CHAT_POLICY } from "@/features/chat/core/prompt/system";
import { chatContextNote, chatContextOf } from "@/features/childChats/core/context";
import { joinContexts, workplaceMoveContext } from "@/features/workplaceMove/core/workplaceMove";
import type { ChatRemover } from "@/features/chat/core/tools/aiChatRemove";
import type { AiWorkplaceDeps } from "@/features/workplaceMove/core/aiWorkplace";
import type { NoteService } from "@/features/notes/core/notes";
import type { UsageMonitor } from "@/features/ai/core/index";
import { SPENDING_NOTICES } from "@shared/ai/overage";
import type { StartedChild } from "@/features/childChats/core/aiCreateChat";
import type { ChildChatInput } from "@/features/childChats/core/children";
import type { AgentProvider, ProviderCallbacks, ProviderTurnParams, ProviderTurnResult } from "@/features/ai/core/providers/types";
import { trashCommandEnv, type TrashCommand } from "@/features/trash/core/command";
import { bashSandboxFor, type BashSandbox, type BashSandboxDeps } from "@/features/guard/core/sandbox/bashSandbox";
import { switchAfterCompact, type SessionTrash } from "./sessionSwitch";
import { stoppedSubagentsNotice } from "./interruptedTurnEnd";
import type { Store } from "@/features/chat/core/stores";
import { networkStoppedSubagents, unfinishedSubagents } from "@shared/chat/subagents";
import type { Question } from "@shared/chat/approvalTypes";
import type { CompactTrigger } from "@shared/chat/chatEvent";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { PROVIDER_AUTH_MODE_LABELS, type ProviderId } from "@shared/settings/types";
import type { UploadStore } from "@/features/attachments/core/uploads";
import type { ChatRuntime } from "./runtime";
import { workdirOf } from "./workdir";
import { autoPreCompactParams, postCompactItem, postCompactPromptOf, preCompactPromptOf } from "@/features/compact/core/preCompact";
import type { McpToolHost } from "@/foundation/core/aiTools/host";
import { AiToolRegistry } from "@/foundation/core/aiTools/registry";
import type { AiToolGroup } from "@/foundation/core/aiTools/tool";
import { CHAT_TOOLS_HEAD, chatToolGroups } from "@/features/chat/core/tools/chatTools";
import { aiTurnOf } from "@/features/chat/core/tools/aiTurn";
import type { ProviderKeyVault } from "@/features/ai/core/providers/keys";
import { retryProviderHandoffPreparation } from "@/features/providerSwitch/core/providerSwitch";
import { providerCan } from "@shared/ai/providers";

/** 実行に使うもの（Runner から受け取る） */
export interface ExecutionDeps {
  /** OS の拒否ログを安全に読み取る口（実行ごとに診断を作る） */
  sandboxDiagnostics?: import("@/features/guard/core/sandboxDiagnosticsPlatform").SandboxDiagnosticsPlatform;
  store: Store;
  approvals: ApprovalCenter;
  providers: Record<ProviderId, AgentProvider>;
  uploads?: UploadStore;
  bus?: Bus;
  /** プロジェクトのノートのフォルダ（ノートのチャットで、AI にノートを読み書きさせるため。なければノートのチャットでもノートのフォルダを足さない） */
  noteDirOf?: (project: Project) => string;
  /** 埋め込みブラウザの操作（デスクトップアプリのメインプロセスが渡す。なければ AI にブラウザのツールを出さない） */
  browser?: BrowserControl;
  /** 内蔵ターミナルの読み取り（デスクトップアプリのメインプロセスが渡す。なければ AI にターミナルのツールを出さない） */
  terminals?: TerminalControl;
  /** DB クライアント（AI に見せる接続があるプロジェクトで、AI に DB のツールを出す。なければ出さない） */
  databases?: DatabaseService;
  /** チャットを作る（Runner が渡す。チャットの AI にチャット（子・兄弟・親のないチャット）を作るツールを出す。なければ出さない） */
  startChat?: (from: Chat, input: ChildChatInput) => Promise<StartedChild>;
  /** Docker タブ（AI の Docker の守りが docker ps・compose の組の名前を引く。なければ守りを付けない） */
  docker?: DockerService;
  /** ワークツリーの実行環境（作業場所がポートの帯を持つワークツリーなら、AI に PORT を渡す。なければ渡さない） */
  worktreeEnvs?: WorktreeEnvService;
  /** 使用状況の見張り（AI の get_usage が読み、実行中の支払いの知らせを渡す。なければ get_usage は使えないと返し、知らせは見ない） */
  usage?: UsageMonitor;
  /** ノート（AI の move_note が名前を変える・移す。なければそのツールは使えないと返す） */
  notes?: NoteService;
  /** チャットが作業中か（AI の update_chat が、作業中の子チャットを親から外すのを断る。Runner が渡す。なければ作業中とみなさない） */
  isBusy?: (chatId: number) => boolean;
  /**
   * AI に渡す kickoff-trash（rm の代わりに Kickoff のゴミ箱へ入れる。trash/command.ts）。あれば PATH などを渡し、rm・git clean などを断る守りを付ける。
   * なければ（置けなかった・テスト）付けない
   */
  trashCommand?: TrashCommand;
  /** 乗り換えた古い会話記録をゴミ箱へ入れる（なければ乗り換えても古い記録は残す） */
  sessionTrash?: SessionTrash;
  /** ワークツリーの後始末（AI の finish_worktree。Runner を作ったあとで attach が渡す。なければそのツールを出さない） */
  worktreeFinisher?: WorktreeFinisher;
  /** 利用者が見ているもの（AI の get_user_view が読む。なければそのツールを出さない） */
  userViews?: UserViewRegistry;
  /** チャットのアーカイブ・削除（AI の archive_chat・delete_chat。Runner を作ったあとで useChatRemover が渡す。なければそのツールを出さない） */
  chatRemover?: ChatRemover;
  /** AI が作業場所を移す予約（Runner が渡す。なければ AI に move_workplace を出さない） */
  workplaceMoves?: AiWorkplaceDeps["reservations"];
  /** AI の Bash の砂場（OS ごとの決まり・通信の中継・ゴミ箱。なければ砂場にかけない（テスト）） */
  bashSandbox?: BashSandboxDeps;
  /** コアの MCP サーバー（AI の操作ツールを実行ごとの鍵で出す。なければツールを出さない（テスト）） */
  toolHost?: Pick<McpToolHost, "open">;
  /** 上の機能が出した AI のツールの組（組み立てが全部の機能の CoreFeature.aiTools を集めて渡す。chat の組と同じ並びで出す） */
  aiTools?: readonly AiToolGroup[];
  /** AI の API キー（設定でログインの仕方を API キーにした AI に渡す。なければいつもサブスク） */
  providerKeys?: ProviderKeyVault;
}

/** 1 回の実行の依頼（送った指示。すぐ動かす） */
export interface TurnRequest {
  chatId: number;
  prompt: string;
  /** 指示の ID（自分の発言の記録の message_uuid。ファイルを戻すときの目印） */
  promptId?: string;
  /** 会話の要約（/compact）。発言・結果としては残さず、未読にもしない */
  compact?: boolean;
  /** 手で圧縮する前の圧縮前指示。最後まで終わったら、続けて会話を圧縮する（Runner） */
  thenCompact?: boolean;
  /**
   * 圧縮のきっかけ（compact のとき。省けば手で圧縮した manual）。自動の圧縮の前の圧縮前指示の作業が、圧縮しないまま終わったときに
   * Runner が続けて圧縮する実行は auto（上限に近づいて Claude Code が始めようとした圧縮を、作業の終わりで済ませる）
   */
  compactTrigger?: CompactTrigger;
  /** 再試行時に資料と同時に取った送信中の印。ほかの操作へ渡さない。 */
  claimedHandoffEventId?: number;
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
 * 1 回の実行を最後まで進める: 作業場所を決めてプロバイダーを動かし、結果をチャットに反映する。
 * 作業中の様子（裏の作業・再試行・圧縮中・作業中のチャットへの操作）はチャットの runtime に書く（画面には runtime が配る）。
 * 失敗はチャットの失敗として記録する（投げない）。中断は signal で伝わる
 */
export async function executeTurn(deps: ExecutionDeps, runtime: ChatRuntime, { chatId, prompt, promptId, compact = false, compactTrigger, claimedHandoffEventId }: TurnRequest, signal: AbortSignal): Promise<TurnOutcome> {
  const { store, providers } = deps;
  const handoff = store.chatProviderHandoffs.get(chatId);
  let handoffClaimed = false;
  // 作業した場所と、始めたときのブランチ（調べ終える前に失敗した・Git でない・ブランチから外れていれば null）
  let turnDir: string | null = null;
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
    store.chats.update(chatId, { status: "running", turn_started_at: new Date().toISOString(), finished_worktree_branch: null, ...(branch ? { branch } : {}) });
    // この実行より前の記録（止まったサブエージェントを、この実行の分だけ数えるため）
    const since = store.events.latestId(chatId) ?? 0;
    // 上限に近づいて自動で圧縮する前に足す圧縮前指示（手で圧縮する実行には足さない）
    const preCompactText = compact ? null : preCompactPromptOf(store, project);
    // 圧縮したら（手で・自動のどちらも）、預かった指示より先に送る圧縮後指示
    const postCompactText = postCompactPromptOf(store, project);
    // プロジェクトで GitHub のアカウントを選んでいれば、AI が動かす gh・git もそのアカウントにする（gh にそのアカウントがなければ、gh で有効なもののまま）
    // 作業場所がポートの帯を持つワークツリーなら、開発サーバーの番号（PORT=帯+00）も渡す
    // rm の代わりに Kickoff のゴミ箱へ入れる kickoff-trash を PATH に足す（どこで消しても、どのチャットが消したか分かるようにチャットの ID も）
    const env = {
      ...(deps.worktreeEnvs?.envFor(cwd) ?? {}),
      ...(project.github_account ? await runAsGitHubAccount(project.github_account, githubEnvForGit) : {}),
      ...(deps.trashCommand ? trashCommandEnv(deps.trashCommand, chat.id) : {}),
    };

    // Bash の砂場（書ける場所を作業場所・ノートのフォルダ・決まりの例外だけにする。読めるフォルダに足した添付・作業場所の外の参照資料は書かせない）
    const noteDir = deps.noteDirOf ? ensureDir(deps.noteDirOf(project)) : null;
    // 計画モードと「AI で整える」の専用の保護は、アプリの既定にかかわらず維持する
    const useSandbox = chat.sandbox_enabled || chat.permission_mode === "plan" || chat.untracked_only;
    if (!useSandbox && !providerCan(chat.provider, "sandbox_off")) throw new Error("この AI は、Kickoff からサンドボックスをオフにする設定にまだ対応していません");
    const sandbox = useSandbox && deps.bashSandbox
      ? await bashSandboxFor(deps.bashSandbox, { workdir: cwd, noteDir, readOnlyDirs: [...(deps.uploads ? [deps.uploads.dir] : []), ...readOnlyReferences(project, cwd)] })
      : null;

    // 動かし始める前（作業場所・ブランチを調べている間）に止められたら、プロバイダーを動かさずに中断で終える（中断済みの signal には abort の知らせが来ない）
    const result: ProviderTurnResult = signal.aborted ? { status: "cancelled", sessionId: chat.session_id } : await runProvider();
    async function runProvider(): Promise<ProviderTurnResult> {
      // ログインの仕方（API キーにしたのに置いていない・開けなければ、動かさずに分かる文で止める）
      const auth = (await deps.providerKeys?.authFor(chat.provider)) ?? { mode: "subscription" as const, apiKey: null };
      if (auth.mode === "api_key" && !auth.apiKey) throw new Error(`${providers[chat.provider].label} のログインの仕方が「${PROVIDER_AUTH_MODE_LABELS.api_key}」ですが、API キーを読めませんでした。設定の AI の欄で API キーを置き直してください`);
      // その AI のモデルの一覧にない名前（ほかの AI のモデルなど）は外し、その AI の既定で動かす。チャットにも直して残す
      const model = await knownModel(chat.provider, providers[chat.provider], chat.model);
      if (model !== chat.model) store.chats.update(chatId, { model });
      const params: ProviderTurnParams = {
        ...buildTurnParams(deps, chat, project, { cwd, noteDir, sandbox }, runtime.writeAllowed, prompt, promptId, compact ? null : takePendingNote(runtime)),
        model,
        compact: compact || prompt.trim() === "/compact", // 手で頼んだ圧縮（送信待ちの圧縮の行・チャット欄に書いた /compact）
        preCompact: autoPreCompactParams(preCompactText, chat, runtime.preCompactSent),
        env,
        auth,
      };
      const initialContext = params.turnContext ?? null;
      if (handoff) {
        if (compact || (handoff.state !== "ready" && !(handoff.state === "sending" && handoff.eventId === claimedHandoffEventId)) || handoff.provider !== chat.provider) throw new Error("AI の引き継ぎを確認するまで、この操作はできません");
        params.turnContext = joinContexts(params.turnContext ?? null, handoff.context);
      }
      const callbacks = callbacksFor(deps, runtime, chat, signal, compact, compactTrigger ?? compactTriggerOf(prompt, compact), { pre: preCompactText, post: postCompactText });
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
        if (handoff) {
          if (claimedHandoffEventId === handoff.eventId) {
            const current = store.chatProviderHandoffs.get(chatId);
            if (!current || current.eventId !== handoff.eventId || current.provider !== chat.provider || current.state !== "sending") throw new Error("AI の引き継ぎ状態が変わったため、送信を中止しました");
          } else if (!store.chatProviderHandoffs.claim(chatId, handoff.eventId, chat.provider)) throw new Error("AI の引き継ぎ状態が変わったため、送信を中止しました");
          handoffClaimed = true;
        }
        const first = await providers[chat.provider].run({ ...params, tools: tools?.endpoints ?? [] }, callbacks, signal);
        if (!handoff || !first.resumeSessionMissing || first.status !== "failed" || !chat.session_id || first.sessionId !== chat.session_id || signal.aborted) return first;
        // 「再開要求の段階で履歴がない」と確定した場合は、まだ利用者の指示は送られていない。
        if (!store.providerSwitch.markSessionMissing(chatId, handoff.eventId, chat.provider, chat.session_id)) throw new Error("AI のセッション状態が変わったため再開を中止しました");
        handoffClaimed = false;
        store.events.add(chatId, { type: "notice", message: "以前の AI のセッションが見つからなかったため、新しいセッションを作ります。以前のセッションにしかない文脈は引き継げません。" });
        if (!deps.uploads) throw new Error("添付の保存先がないため、会話の引き継ぎを準備できません");
        // 再準備と送信中の印を同時に保存する。終了が割り込んでも、元の指示を飛ばして次へ進まない。
        const retry = await retryProviderHandoffPreparation({ store, uploads: deps.uploads, requireIdle: () => {} }, chatId, true);
        handoffClaimed = true;
        if (retry.warning) store.events.add(chatId, { type: "notice", message: retry.warning });
        if (signal.aborted) throw new Error("新しいセッションの準備中に中断しました");
        const prepared = store.chatProviderHandoffs.get(chatId);
        if (!prepared || prepared.eventId !== handoff.eventId || prepared.state !== "sending") throw new Error("AI の引き継ぎ状態が変わったため再開を中止しました");
        return await providers[chat.provider].run({ ...params, resumeSessionId: null, turnContext: joinContexts(initialContext, prepared.context), tools: tools?.endpoints ?? [] }, callbacks, signal);
      } finally {
        signal.removeEventListener("abort", closeDiagnostics);
        diagnostics?.close();
        tools?.close();
      }
    }
    const network = result.status === "failed" && Boolean(result.network);
    await rememberEndBranch();
    applyResult(store, chatId, result, compact, since, network);
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
    // 圧縮した作業が最後まで終わったら、直近の区切りだけの新しいセッションに乗り換える（会話記録が大きくなり続けないように。失敗しても作業は止めない）
    if (result.status === "completed") {
      await switchAfterCompact({ store, provider: providers[chat.provider], trash: deps.sessionTrash }, chatId, cwd, since).catch((e: unknown) =>
        console.warn(`[session] 会話記録を乗り換えられませんでした: ${errorMessage(e)}`),
      );
    }
    const usageLimit = result.status === "failed" && !network ? result.usageLimit : undefined;
    if (!network) return { status: result.status, network, ...(usageLimit ? { usageLimit } : {}) };
    const stoppedAgents = networkStoppedSubagents(store.events.list(chatId), since).map((s) => ({ agentId: s.agentId!, description: s.description }));
    return { status: result.status, network, stoppedAgents };
  } catch (e) {
    const message = errorMessage(e);
    if (handoff) {
      if (handoffClaimed) store.chatProviderHandoffs.markUncertain(chatId, handoff.eventId, message);
      else if (claimedHandoffEventId === handoff.eventId) store.chatProviderHandoffs.blockBeforeSend(chatId, handoff.eventId, message);
      else store.chatProviderHandoffs.blockReady(chatId, handoff.eventId, message);
    }
    await rememberEndBranch();
    store.chats.update(chatId, { status: "failed", error: message, unread: true }); // 失敗も、見るまでは未読にする
    store.events.add(chatId, { type: "error", message });
    return { status: "failed", network: false };
  } finally {
    // 再試行・裏の作業・圧縮中の表示を消す（終わったので。Claude Code が終わると裏の作業も残らない）
    runtime.control = null;
    runtime.update({ retry: null, background: null, compacting: null, drawingVisual: false });
  }
}

/**
 * この実行の中の圧縮のきっかけ: 手で圧縮した（圧縮のボタン = compact、チャット欄から /compact を送った）なら manual、
 * ほかの指示の途中で起きた圧縮は、コンテキストが上限に近づいて Claude Code が自動で始めたもの
 */
function compactTriggerOf(prompt: string, compact: boolean): CompactTrigger {
  return compact || /^\/compact(?:\s|$)/.test(prompt.trimStart()) ? "manual" : "auto";
}

/** 作業場所（workdirOf）。フォルダが消えていれば（ワークツリーをアプリの外で消したときなど）分かる文で止める */
async function resolveWorkdir(chat: Chat, project: Project): Promise<string> {
  const cwd = workdirOf(chat, project);
  const isDir = await fs.stat(cwd).then((s) => s.isDirectory(), () => false);
  if (!isDir) throw new Error(`作業場所のフォルダが見つかりません（${cwd}）。ワークツリーが消された可能性があります。新しいチャットで作業場所を選び直してください`);
  return cwd;
}

/** フォルダがなければ作って返す（作れなければ null。ノートのフォルダ） */
function ensureDir(dir: string): string | null {
  try {
    mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

/** 次に送るものに一度だけ添える知らせを取り出す（取り出したら外す。利用者が作業場所を移す予約を取り消したときなど） */
export function takePendingNote(runtime: ChatRuntime): string | null {
  const note = runtime.pendingNote;
  runtime.pendingNote = null;
  return note;
}

/** プロバイダーに渡すもの（作業場所・指示・権限） */
function buildTurnParams(
  deps: ExecutionDeps,
  chat: Chat,
  project: Project,
  { cwd, noteDir, sandbox }: { cwd: string; noteDir: string | null; sandbox: BashSandbox | null },
  writeAllowed: Set<string>,
  prompt: string,
  promptId?: string,
  note: string | null = null,
): Omit<ProviderTurnParams, "compact"> {
  // ノートのフォルダ（executeTurn がまだなければ作る: ノートのタブで最初のノートを作るのと同じ場所）も読み書きできる場所に足し、どのチャットでも「ノート」が「ノート」タブのノートのことだと伝える
  // （入力欄にノートを添付して続きを頼む・「ノートに書いて」と頼めるように）。ノートのチャットは、どのノートについての会話かも伝える（作業場所はプロジェクトのまま。コードも読める）
  return {
    cwd,
    prompt,
    ...(promptId ? { promptId } : {}),
    systemPrompt: buildSystemPrompt(project, cwd, noteDir ? { dir: noteDir, file: chat.note_path ? path.join(noteDir, chat.note_path) : null } : undefined, {
      trash: deps.trashCommand !== undefined,
      sandbox: sandbox ? { unsandboxed: sandbox.unsandboxedCommands } : undefined,
      editScopeEnabled: chat.edit_scope_enabled || chat.untracked_only,
      browser: deps.browser ? deps.store.settings.get().link_open_in : undefined,
    }),
    turnContext: joinContexts(chatContextNote(chatContextOf(deps.store, chat)), workplaceMoveContext(deps.store.events.pendingWorkplaceMove(chat.id)), note),
    policy: CHAT_POLICY,
    resumeSessionId: chat.session_id,
    model: chat.model,
    effort: chat.effort,
    permissionMode: chat.permission_mode,
    fastMode: chat.fast_mode,
    autoCompactPct: deps.store.settings.get().auto_compact_pct,
    // 添付ファイルの保存先と参照資料を読めるようにし、リポジトリの外の参照資料には書き込ませない
    additionalDirectories: [...(deps.uploads ? [deps.uploads.dir] : []), ...referenceDirectories(project), ...(noteDir ? [noteDir] : [])],
    // 作業場所の外の参照資料は読むだけ（ワークツリーのチャットからは、本体の中の資料も読むだけ）
    readOnlyPaths: readOnlyReferences(project, cwd),
    // ［AI で整える］のチャットは、Git で管理していないファイルだけを書ける（続きの指示でも）
    untrackedOnly: chat.untracked_only,
    // ファイルを書き換えるツールの先は、作業場所・ノートのフォルダ・OS の一時フォルダ・決まりの例外だけ（同じリポジトリのほかの作業場所は断り、それ以外の外は承認カードで聞く。
    // 一時フォルダは Bash の砂場でも書けるので、Write で一時ファイルを置くたびに聞かない。［AI で整える］のチャットは上の守りがもっと狭く絞るので付けない）
    writeScope: chat.untracked_only || !chat.edit_scope_enabled
      ? null
      : {
          writableDirs: [...(noteDir ? [realPathOrSelf(noteDir)] : []), ...(deps.bashSandbox?.rules.tempDirs ?? [])],
          workplaces: () => workplacesOf(project.repo_path),
          allowed: writeAllowed,
        },
    // 「見せない」接続に、AI が Bash・ファイルのツールで直接入るのを断る（SQLite のファイルは作業場所と本体の両方で解く）
    hiddenDb: hiddenDbTargets(deps.databases?.stores.dbConnections.list(project.id) ?? [], [cwd, project.repo_path]),
    // 別の作業場所・ほかのプロジェクトの Docker のコンテナとボリュームに手を出す Bash は、流す前に承認カードで聞く
    dockerGuard: deps.docker ? createDockerGuard(deps.docker, project, cwd) : null,
    // rm・git clean などでファイルを消す Bash は断り、kickoff-trash を使わせる（どこのファイルでも）
    deleteGuard: deps.trashCommand !== undefined,
    bashSandbox: sandbox,
    disableSandbox: !chat.sandbox_enabled && chat.permission_mode !== "plan" && !chat.untracked_only,
  };
}

/** 作業場所の外の参照資料（読むだけ。ワークツリーのチャットからは、本体の中の資料も読むだけ） */
function readOnlyReferences(project: Project, cwd: string): string[] {
  return project.reference_paths.map((r) => r.path).filter((p) => !isInside(cwd, p));
}

/**
 * プロバイダーからの知らせ: 途中経過は配るだけ、作業中の様子は runtime に書き（runtime が画面に配る）、イベントは記録、
 * 承認依頼は回答を待つ（待つ間は回答待ち）
 */
function callbacksFor(
  { store, approvals, bus, usage }: ExecutionDeps,
  runtime: ChatRuntime,
  chat: Chat,
  signal: AbortSignal,
  compact: boolean,
  compactTrigger: CompactTrigger,
  { pre: preCompactText, post: postCompactText }: { pre: string | null; post: string | null },
): ProviderCallbacks {
  const chatId = chat.id;
  const projectId = chat.project_id;
  return {
    subagentProgress: (subagent) => {
      bus?.publish({ type: "chat_subagent", project_id: projectId, chat_id: chatId, subagent });
    },
    commandOutput: (output) => {
      bus?.publish({ type: "chat_command_output", project_id: projectId, chat_id: chatId, output });
    },
    retry: (retry) => runtime.update({ retry }),
    // 手で圧縮する実行（圧縮のボタン）には発言を足さない（足すと、その返答が圧縮の実行の中に入り、未読・作業の終わりが残らない）。
    // 圧縮中の「いま」は預かり、圧縮の実行の終わりで Runner が送る
    control: (control) => {
      runtime.control = compact ? null : control;
    },
    background: (background) => runtime.update({ background }),
    // 上限を超えたあとの支払い（Claude の追加の使用枠・Codex のクレジット）で動き始めたら、どの作業から引かれたかが分かるようお知らせに残す
    // （下の帯の札は使用状況の知らせで赤くなる）
    spending: (note) => {
      const message = SPENDING_NOTICES[chat.provider];
      if (usage?.noteSpending(chat.provider, note) && message) store.events.add(chatId, { type: "notice", message });
    },
    drawingVisual: (drawingVisual) => runtime.update({ drawingVisual }),
    // 圧縮を始めた時刻は、終わるまで変えない（続けて始まったと知らされても、最初の時刻のまま。Claude Code は待っている間も 30 秒ごとに知らせ直す）
    // 圧縮が始まったら、この作業が終わるまで「いま」を預かる（圧縮後指示のやり取りに混ぜない。作業の終わりで Runner が外す）
    compacting: (active) =>
      runtime.update({
        compacting: active ? (runtime.compacting ?? { since: new Date().toISOString(), trigger: compactTrigger }) : null,
        ...(active ? { compactedTurn: true } : {}),
      }),
    // 圧縮の直後のコンテキストの大きさは、作業の終わりを待たずにチャットへ書く（入力欄のメーターがすぐ縮む。作業の終わりには最後の応答の大きさで書き直す）
    context: (tokens) => {
      if (store.chats.get(chatId)?.context_tokens !== tokens) store.chats.update(chatId, { context_tokens: tokens });
    },
    // 失敗は、手で圧縮したときだけお知らせに残す（自動の圧縮の失敗は、会話が短くて要約するものがない too_few_groups なども含み、
    // Claude Code も知らせない。本当にあふれたら、作業そのものが失敗として残る）
    compactFailed: (reason) => {
      if (compactTrigger === "manual") store.events.add(chatId, { type: "notice", message: `会話の圧縮に失敗しました${reason ? `（${reason}）` : ""}` });
    },
    stream: (text) => {
      bus?.publish({ type: "chat_delta", project_id: projectId, chat_id: chatId, text });
    },
    // 自動の圧縮の前に圧縮前指示を足した: 札付きの自分の発言として残す（AI には前置きを付けて送っている）
    preCompactSent: (uuid) => {
      if (!preCompactText) return;
      runtime.preCompactSent = true;
      // 圧縮が終わるまで、「いま」は預かる（圧縮前指示の作業に混ぜない）
      runtime.update({ awaitingCompact: true });
      store.events.add(chatId, { type: "user", text: preCompactText, pre_compact: true, message_uuid: uuid });
    },
    // 合図のあと裏の作業を待って止まっていたので、Kickoff が発言を足して圧縮を走らせた: 何が起きたかをお知らせに残す（足した文は AI 向けなので発言にしない）
    preCompactNudged: () => {
      store.events.add(chatId, { type: "notice", message: "圧縮前指示が済んだあと、AI が裏の作業の終わりを待って止まっていたので、会話の圧縮を始めるよう Kickoff が促しました" });
    },
    emit: (event) => {
      if (event.type === "init" && event.session_id !== store.chats.get(chatId)?.session_id) {
        store.chats.update(chatId, { session_id: event.session_id });
      }
      // 手で圧縮する実行の圧縮は、頼んだきっかけで残す（自動の圧縮の前の指示のあとに Runner が続けた圧縮は auto）
      const saved = store.events.add(chatId, event.type === "compact" && compact ? { ...event, trigger: compactTrigger } : event);
      // 圧縮した（記録を残してから）: 次に上限に近づいたら、また圧縮前指示を送る。圧縮後指示があれば、預かった指示の先頭に置く
      // （圧縮が終わったら、それらより先に伝える。圧縮前指示のあとに送った指示は、必ず圧縮後指示のあとになる）。
      // 手で圧縮する実行（compact）の終わりまでは預かったままにする（Runner が実行の終わりで外し、圧縮後指示から送る）
      if (event.type === "compact") {
        runtime.preCompactSent = false;
        const post = postCompactText ? [postCompactItem(postCompactText)] : [];
        runtime.update({ afterCompact: [...post, ...runtime.afterCompact], compactedTurn: true, ...(compact ? {} : { awaitingCompact: false }) });
        // 圧縮中をもう外していた（知らせの順が前後した）ときは、ここで伝える
        runtime.flushAfterCompact();
      }
      // ノートのチャットでツールの結果が届いたら（AI がノートを書き換えたかもしれない）、ノートが変わったと知らせる（開いているノートは、書きかけでなければ読み直す）
      if (chat.note_path && event.type === "tool_result") bus?.publish({ type: "notes", project_id: projectId, path: null });
      // 作業中でも、AI の文章の返答が届いたら未読にする（一番下まで見ると既読。要約の途中経過では付けない）
      if (!compact && isUnreadEvent(saved) && !store.chats.get(chatId)?.unread) store.chats.setUnread(chatId, true);
    },
    requestApproval: async (req, approvalSignal) => {
      const { approval, decision } = approvals.request({ chatId, projectId }, req, approvalSignal);
      store.events.add(chatId, {
        type: "approval",
        approval_id: approval.id,
        kind: approval.kind,
        tool_name: approval.tool_name,
        title: approval.title,
      });
      const answer = await decision;
      // AI からの質問に答えたときは、何と答えたか（選んだままの回答と添付・選んだ選択肢の図）も残す（画面は「質問への回答」の吹き出しで出す）
      const previews = answer.action === "answer" ? chosenPreviews((approval.input.questions as Question[] | undefined) ?? [], answer.plain ?? answer.answers) : undefined;
      store.events.add(
        chatId,
        answer.action === "answer"
          ? {
              type: "approval_resolved",
              approval_id: approval.id,
              kind: approval.kind,
              action: "answer",
              answers: answer.plain ?? answer.answers,
              ...(answer.attachments ? { attachments: answer.attachments } : {}),
              ...(previews ? { previews } : {}),
            }
          : { type: "approval_resolved", approval_id: approval.id, kind: approval.kind, action: answer.action },
      );
      return answer;
    },
  };
}

/** 結果をチャットに反映する（状態・費用・回数・コンテキスト・未読） */
function applyResult(store: Store, chatId: number, result: ProviderTurnResult, compact: boolean, since: number, network: boolean) {
  const current = store.chats.get(chatId)!;
  store.chats.update(chatId, {
    status: result.status,
    session_id: result.sessionId ?? current.session_id,
    cost_usd: current.cost_usd + (result.costUsd ?? 0),
    // 要約は会話の回数・最後の回答に数えない
    num_turns: current.num_turns + (compact ? 0 : (result.turns ?? 0)),
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
  const notice = compact || network ? null : stoppedSubagentsNotice(unfinishedSubagents(store.events.list(chatId), since).map((s) => s.description));
  if (notice) store.events.add(chatId, { type: "notice", message: notice });
  // 要約は compact イベントだけを残す（失敗したときは理由を残す）
  if (!compact || result.status !== "completed") {
    store.events.add(chatId, {
      type: "result",
      status: result.status,
      text: result.status === "completed" ? result.result : result.error,
      ...(network ? { network: true } : {}),
      ...(result.usageLimit ? { usage_limit: { resets_at: result.usageLimit.resetsAt ?? null } } : {}),
      // 分岐・巻き戻しの起点（最後まで終わったときだけ。止めた作業の最後のメッセージはセッションに残らないことがある）
      ...(result.status === "completed" && result.lastMessageId && result.sessionId
        ? { session_id: result.sessionId, message_id: result.lastMessageId }
        : {}),
    });
  }
}

/** 参照資料を読めるようにするフォルダ（ファイルはそのフォルダ）。重複は除く */
function referenceDirectories(project: Project): string[] {
  return [...new Set(project.reference_paths.map((r) => (r.kind === "folder" ? r.path : path.dirname(r.path))))];
}
