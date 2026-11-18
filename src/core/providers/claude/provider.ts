import os from "node:os";
import {
  forkSession,
  getSubagentMessages,
  query,
  type Options,
  type Query,
  type SDKResultMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { createBackgroundTracker } from "./background.js";
import { copyForWorkplaceMove, findSessionFile, listSessionFiles, removeSession, sessionFileInfo, sessionFilesSize, trashSessions, trimToRecentSegments, writeRecentSegments } from "./sessionFiles.js";
import { createTurnOver } from "./turnOver.js";
import { createCommandOutputWatcher } from "./commandOutput.js";
import { createInputChannel } from "./input.js";
import { createPreCompactGate, preCompactHook, replyText } from "./preCompact.js";
import { errorMessage } from "@shared/errors";
import { isNetworkError } from "@shared/chat/networkErrors";
import { isUsageLimitError, resetTimeOf } from "@shared/chat/usageLimit";
import { autoCompactEnv } from "@shared/chat/autoCompact";
import { ERROR_LABELS, FAST_MODE_REASONS, TERMINAL_ONLY_COMMANDS } from "./labels.js";
import { EFFORT_LEVELS, type EffortLevel, type FileRewindResult, type ModelOption, type PlanUsage, type ProviderStatus, type SlashCommandOption } from "@shared/types";
import { createCanUseTool } from "./approvals.js";
import { mcpServersOf, toolAllowList } from "./mcpServers.js";
import { agentSpawnNotes } from "./spawnNotes.js";
import { agentEnv, bundledClaudeVersion, claudeAuthEnv, resolveClaudeExecutable } from "./env.js";
import { createMessageState, emitSdkMessage } from "./messages.js";
import { subagentLogOf } from "./subagentLog.js";
import { KICKOFF_DISALLOWED_TOOLS, turnContextHook, turnHooks, toAllowedTools } from "./policy.js";
import type { SelfInfo } from "../../chat/guard/selfProtection.js";
import { normalizeUsage, readPlanDisplayName } from "./usage.js";
import type { AgentProvider, AskModel, ProviderCallbacks, ProviderTurnParams, ProviderTurnResult, SessionFileInfo, SubagentLogItem } from "../types.js";
import { runCommand } from "../../system/exec.js";
import { claudeSandboxOption } from "./sandbox.js";
import { cleanTitle, summarizePrompt, titlePrompt } from "../askPrompts.js";
import { confirmedClaudeMissingResume } from "./missingResume.js";
import { CLEAR_COMMAND_DESCRIPTION } from "@shared/chat/queueActions";
import { noteSyncSince, syncStart } from "../../system/stallWatch.js";

/** 1 回だけ聞くときの段ごとのモデル（AskModel。軽い = haiku・ふつう = sonnet） */
const ASK_MODELS: Record<AskModel, string> = { light: "haiku", standard: "sonnet" };

export class ClaudeProvider implements AgentProvider {
  readonly id = "claude" as const;
  readonly label = "Claude Code";
  readonly implemented = true;
  private readonly executable = resolveClaudeExecutable();

  /** self: エージェントを動かしている Kickoff 自身（自分を壊すツールの呼び出しを断るのに使う） */
  constructor(private readonly self?: SelfInfo) {}

  async status(): Promise<ProviderStatus> {
    // 同梱の Claude Code の版（設定の「接続」に出す。上げるのは Kickoff の開発の側なので、新しい版の知らせはここでは出さない）
    const base = { id: this.id, label: this.label, implemented: true, version: bundledClaudeVersion(), bundled: true };
    if (!this.executable) {
      return { ...base, installed: false, logged_in: false, detail: "Claude Code のバイナリが見つかりません" };
    }
    try {
      const stdout = await runCommand(this.executable, ["auth", "status"], { env: agentEnv(), timeout: 20_000 });
      const info = JSON.parse(stdout) as { loggedIn?: boolean; authMethod?: string; email?: string; subscriptionType?: string };
      // プランは種類（Max の段階を区別しない "max"）より、アカウントの表示名（"Ultra"・"Max 20x" など）を出す
      const plan = info.subscriptionType ? ((await readPlanDisplayName()) ?? info.subscriptionType) : undefined;
      return {
        ...base,
        installed: true,
        logged_in: Boolean(info.loggedIn),
        account: info.email,
        plan,
        detail: info.loggedIn
          ? `${info.authMethod ?? "ログイン済み"}${plan ? `（${plan} プラン）` : ""}`
          : "未ログインです。ターミナルで `claude` を起動してログインしてください",
      };
    } catch (e) {
      return { ...base, installed: true, logged_in: false, detail: `ログイン状態を取得できませんでした: ${errorMessage(e)}` };
    }
  }

  /**
   * /usage と同じプランの使用枠を取得する。メッセージを送らないセッションを一瞬開くだけなので、
   * モデルへのリクエストは発生しない（使用枠を消費しない）。
   * 注意: SDK 側で EXPERIMENTAL 扱いの API。形が変わったら normalizeUsage を直す。
   */
  async usage(): Promise<PlanUsage> {
    return this.withIdleSession(async (q) =>
      normalizeUsage(await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }), await readPlanDisplayName()),
    );
  }

  /** Claude Code が提示するモデルの一覧（"default" は実体のモデルと重複するので除く） */
  async models(): Promise<ModelOption[]> {
    return this.withIdleSession(async (q) => {
      const models = await q.supportedModels();
      return models
        .filter((m) => m.value !== "default")
        .map((m) => ({
          value: m.value,
          ...(m.resolvedModel ? { resolved_model: m.resolvedModel } : {}),
          label: m.displayName,
          description: m.description,
          efforts: (m.supportedEffortLevels ?? []).filter((e): e is EffortLevel => EFFORT_LEVELS.includes(e)),
          supports_auto_mode: Boolean(m.supportsAutoMode),
          supports_fast_mode: m.supportsFastMode ?? null,
        }));
    });
  }

  /**
   * チャット欄の / で出すコマンド。プロジェクトの設定（.claude/commands・スキル・プラグイン）も読むよう、cwd とすべての設定を渡す。
   * ターミナルの画面でしか意味のないコマンド（終了・見た目の切り替えなど）は出さない
   */
  async commands(cwd: string): Promise<SlashCommandOption[]> {
    return this.withIdleSession(
      async (q) =>
        (await q.supportedCommands())
          // __ で始まるものは Claude Code の内部用
          .filter((c) => !TERMINAL_ONLY_COMMANDS.has(c.name) && !c.name.startsWith("_"))
          // /clear は Kickoff が受け取ってコンテキスト消去にするので、説明もその動きにする
          .map((c) => ({ name: c.name, description: c.name === "clear" ? CLEAR_COMMAND_DESCRIPTION : c.description, argument_hint: c.argumentHint ?? "" }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      { cwd, settingSources: ["user", "project", "local"] },
    );
  }

  /**
   * メッセージを送らないセッションを一瞬開いて、制御用の API だけを呼ぶ。
   * モデルへのリクエストは発生しないので、使用枠を消費しない。
   */
  private async withIdleSession<T>(fn: (q: Query) => Promise<T>, extra: Pick<Options, "cwd" | "settingSources" | "resume" | "enableFileCheckpointing"> = {}): Promise<T> {
    let release!: () => void;
    const idle = new Promise<void>((resolve) => (release = resolve));
    async function* noMessages(): AsyncGenerator<SDKUserMessage> {
      await idle;
    }
    const q = query({
      prompt: noMessages(),
      options: { env: agentEnv(), settingSources: [], pathToClaudeCodeExecutable: this.executable, ...extra },
    });
    try {
      return await fn(q);
    } finally {
      release();
      q.close();
    }
  }

  async run(params: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult> {
    const abortController = new AbortController();
    const onAbort = () => abortController.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    // 渡されたときにもう止められていたら、知らせは来ないのでここで止める
    if (signal.aborted) onAbort();

    const canUseTool = createCanUseTool(cb);
    // AI の操作ツール（埋め込みブラウザ・DB・チャット）は、コアの MCP サーバーの口を HTTP でつなぐ（中身と承認はコアが持つ）
    const tools = params.tools ?? [];
    const mcpServers = mcpServersOf(tools);

    let sessionId = params.resumeSessionId;
    let final: SDKResultMessage | undefined;
    let seenOtherMessage = false;
    // メインエージェントの最後の応答で、コンテキストに入っていたトークン数
    let contextTokens: number | undefined;
    // 要約したあとの大きさが分からず、次のメインの応答で知らせるところか
    let contextAfterCompact = false;
    // メインの会話の最後のメッセージの ID（分岐の位置。結果に残す）
    let lastMessageId: string | undefined;
    // 通信を再試行しているところか（返答が届き始めたら終わり）と、応答のないまま再試行したことがあるか（通信の切断の目印）
    let retrying = false;
    let noResponse = false;
    /** 失敗が通信の切断によるものか */
    const network = (error: string | undefined) => noResponse || isNetworkError(error);
    // 使用枠の上限で断られたか（rate_limit_event の rejected・返答のエラー）と、枠が戻る時刻
    let limited = false;
    let limitResetsAt: string | null = null;
    /** 失敗が使用枠の上限によるものなら、枠が戻る時刻を添える */
    const usageLimit = (error: string | undefined) => (limited || isUsageLimitError(error) ? { usageLimit: { resetsAt: limitResetsAt } } : {});

    // 入力はストリーミング（作業中に発言を足す・裏の作業を止めるため、返答が終わり裏の作業もなくなるまで開いておく）
    const input = createInputChannel(params.prompt, params.promptId);
    // 入力を閉じる時（Claude Code が本当に手が空いたとき）。足した発言で次の返答が始まりうるので、足したことも知らせる
    const turnOver = createTurnOver(() => input.close());
    const push = (text: string, uuid?: string) => {
      const ok = input.push(text, uuid);
      if (ok) turnOver.pushed();
      return ok;
    };
    // 実行中のコマンドの出力（Claude Code が書いているファイルを読み続け、終わる前から画面に届ける）
    const commandOutput = createCommandOutputWatcher((output) => cb.commandOutput?.(output));
    // 上限に近づいて自動で圧縮する前に、圧縮前指示を足して済ませてもらう（PreCompact フックで圧縮を止める）
    const preCompact = params.preCompact
      ? createPreCompactGate({ ...params.preCompact, push, onSent: (uuid) => cb.preCompactSent?.(uuid), onNudged: (uuid) => cb.preCompactNudged?.(uuid) })
      : null;
    // Claude Code のプロセスの pid を知らせる（コアのプロセスが落ちたときに、メインが作り直す前に止める）
    const spawnNotes = agentSpawnNotes(params.onAgentSpawned);
    const sandbox = claudeSandboxOption(params.bashSandbox, params.disableSandbox);
    try {
      const q = query({
        prompt: input.messages,
        options: {
          ...spawnNotes.options,
          cwd: params.cwd,
          additionalDirectories: params.additionalDirectories,
          model: params.model || undefined,
          // 決めていなければ指定しない（SDK とモデルの既定に任せる）
          effort: params.effort ?? undefined,
          systemPrompt: { type: "preset", preset: "claude_code", append: params.systemPrompt },
          // ユーザーの ~/.claude（CLAUDE.md・スキル等）とリポジトリの設定を Claude Code と同様に読み込む
          settingSources: ["user", "project", "local"],
          permissionMode: params.permissionMode,
          // AI の操作ツールのうち、聞かずに使わせるもの（埋め込みブラウザの見るだけのもの・DB とチャットのツールのすべて = 承認と断りはツールの中で行う）。
          // 埋め込みブラウザの開く・押す・打つ・JS は権限モードと承認に従う
          allowedTools: [...toAllowedTools(params.policy), ...toolAllowList(tools)],
          // Kickoff のチャットでは使わせないツール（PushNotification・EnterWorktree / ExitWorktree。理由は KICKOFF_DISALLOWED_TOOLS）
          disallowedTools: KICKOFF_DISALLOWED_TOOLS,
          // AI の操作ツールの口は、鍵の見出しを Claude Code の起動の引数に載せないよう標準入力の initialize で渡す
          // （同梱の Claude Code は SDK と同じ版なので読める。決めずにおくと SDK が廃止予定の警告を出す）
          ...(Object.keys(mcpServers).length > 0 ? { mcpServers, mcpServersDelivery: "initialize" as const } : {}),
          canUseTool,
          resume: params.resumeSessionId ?? undefined,
          abortController,
          // 自動圧縮を始める使用率を決めていれば渡す（決めていなければ Claude Code の既定）
          // API キーで動かす設定なら、キーを渡す（agentEnv はプランで動かすため鍵の環境変数を外すので、そのあとに重ねる）
          env: { ...agentEnv(), ...autoCompactEnv(params.autoCompactPct), ...params.env, ...claudeAuthEnv(params.auth) },
          pathToClaudeCodeExecutable: this.executable,
          hooks: {
            ...turnHooks(params, this.self, cb),
            ...(preCompact ? { PreCompact: [preCompactHook(preCompact)] } : {}),
            // このチャットの文脈（子チャットの親など）は、実行の初めの指示に添える
            ...(params.turnContext ? { UserPromptSubmit: [turnContextHook(params.turnContext)] } : {}),
          },
          includePartialMessages: true,
          // 編集の前のファイルを取っておく（巻き戻しで、自分の発言の時点のファイルに戻せるように）
          enableFileCheckpointing: true,
          ...(params.fastMode ? { settings: { fastMode: true } } : {}),
          // Bash を砂場に入れ、書ける場所を作業場所・メモのフォルダ・決まりの例外だけにする（止めるのは OS。メモの仕様書「0020_AI の書き込み先」の段階 2）
          ...(sandbox ? { sandbox } : {}),
        },
      });

      // 作業中の発言の足し方と、裏の作業の止め方を Runner に渡す
      cb.control?.({ tell: push, stopTask: (taskId) => q.stopTask(taskId) });
      // 思考の時間を測る（流れてくる途中経過で始まりと終わりを見る）
      const messageState = createMessageState();
      // 裏で動いている作業と、メインの返答が終わったか（変わったときだけ知らせる）
      const trackBackground = createBackgroundTracker();
      for await (const msg of q) {
        if (msg.type !== "result") seenOtherMessage = true;
        // 1 件の処理に名前を付けて詰まりの見張りに知らせる（system/stallWatch.ts）
        const handleStart = syncStart();
        // 通信の再試行: 画面に回数と次に送り直すまでの時間を知らせる（応答がない = 通信が切れている）
        if (msg.type === "system" && msg.subtype === "api_retry") {
          retrying = true;
          if (msg.error_status === null) noResponse = true;
          cb.retry?.({ attempt: msg.attempt, max_retries: msg.max_retries, retry_delay_ms: msg.retry_delay_ms, at: new Date().toISOString() });
        } else if (retrying && (msg.type === "assistant" || msg.type === "stream_event")) {
          retrying = false;
          cb.retry?.(null);
        }
        if (msg.type === "rate_limit_event" && msg.rate_limit_info.status === "rejected") {
          limited = true;
          limitResetsAt = resetTimeOf(msg.rate_limit_info.resetsAt) ?? limitResetsAt;
        }
        if (msg.type === "assistant" && msg.error === "rate_limit") limited = true;
        commandOutput.handle(msg);
        const sid = emitSdkMessage(msg, cb, messageState);
        const background = trackBackground(msg);
        if (background) cb.background?.(background);
        // Claude Code の手が空き、裏の作業もなくなった: 入力を閉じて終わらせる（足した発言がまだ渡っていなければ閉じない。turnOver.ts）
        turnOver.note(msg, background);
        // 圧縮前指示の合図のあと、裏の作業の終わりだけを待って止まっていたら、背中を押して圧縮を走らせる（preCompact.ts）
        preCompact?.noteWaiting(turnOver.waitingOnBackground());
        // メインの会話の最後のメッセージ（ここから分岐するときの位置）
        if ((msg.type === "assistant" || msg.type === "user") && msg.parent_tool_use_id === null && msg.uuid) lastMessageId = msg.uuid;
        if (sid) sessionId = sid;
        if (msg.type === "result") final = msg;
        if (msg.type === "assistant" && msg.parent_tool_use_id === null) {
          const u = msg.message.usage;
          contextTokens =
            u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + u.output_tokens;
          preCompact?.noteReply(contextTokens, replyText(msg.message.content));
          // 要約したあとの大きさが分からなかったときは、要約のあとの最初の応答で知らせる
          if (contextAfterCompact) {
            contextAfterCompact = false;
            cb.context?.(contextTokens);
          }
        }
        // 要約したあとのコンテキストの大きさ。作業の終わりを待たずに知らせる（自動の圧縮は作業の途中で起き、そのあとも作業が続くため）
        if (msg.type === "system" && msg.subtype === "compact_boundary") {
          const post = msg.compact_metadata.post_tokens;
          preCompact?.noteCompacted(post ?? null);
          if (post !== undefined) {
            contextTokens = post;
            cb.context?.(post);
          } else contextAfterCompact = true;
        }
        noteSyncSince(handleStart, () => `provider:claude:${msg.type}`);
      }
    } catch (e) {
      if (signal.aborted) return { status: "cancelled", sessionId, lastMessageId };
      const error = errorMessage(e);
      return { status: "failed", sessionId, error, lastMessageId, ...(confirmedClaudeMissingResume(e, params.resumeSessionId, final, seenOtherMessage) ? { resumeSessionMissing: true as const } : {}), network: network(error), ...usageLimit(error) };
    } finally {
      signal.removeEventListener("abort", onAbort);
      turnOver.stop();
      preCompact?.stop();
      input.close(true);
      cb.control?.(null);
      commandOutput.stopAll();
      spawnNotes.release();
    }

    if (signal.aborted) return { status: "cancelled", sessionId, lastMessageId };
    if (!final) return { status: "failed", sessionId, error: "エージェントが結果を返さずに終了しました", lastMessageId, network: noResponse };

    // ファストモードを指定したのに使われなかった場合は、理由をチャットに残す
    if (params.fastMode && final.fast_mode_state !== "on" && final.fast_mode_disabled_reason) {
      cb.emit({
        type: "notice",
        message: `ファストモードは使われませんでした（${FAST_MODE_REASONS[final.fast_mode_disabled_reason] ?? final.fast_mode_disabled_reason}）`,
      });
    }

    // 上限は、使ったモデルのうちいちばん大きいコンテキストウィンドウ（サブエージェントの小さいモデルを除くため）
    const windows = Object.values(final.modelUsage ?? {}).map((m) => m.contextWindow).filter((w) => w > 0);
    const context = contextTokens === undefined ? undefined : { tokens: contextTokens, window: windows.length ? Math.max(...windows) : null };
    const common = { sessionId: final.session_id ?? sessionId, costUsd: final.total_cost_usd, turns: final.num_turns, context, lastMessageId };
    if (final.subtype === "success" && !final.is_error) {
      return { ...common, status: "completed", result: final.result };
    }
    const error =
      final.subtype === "success"
        ? final.result
        : final.errors?.join("\n") || ERROR_LABELS[final.subtype] || final.subtype;
    return { ...common, status: "failed", error, network: network(error), ...usageLimit(error) };
  }

  /**
   * 会話を messageId の位置までで分け、新しいセッションにする（元のセッションは変えない）。
   * cwd はそのセッションを動かした作業フォルダ（消えていれば、すべてのプロジェクトから探す）。
   * 写すのは位置の手前の直近 keep 区切り（圧縮の印から後ろ。既定 FORK_KEEP_SEGMENTS = 3、子チャットは 1）だけ: Claude Code は圧縮しても古いやり取りを消さないので、
   * 長く続けた会話を丸ごと写すと 1GB を超え、本体が数秒ずつ止まっていた（1.6GB の親で約 18 秒 → 直近 2 区切りで約 0.2 秒・約 6MB。利用者と決めた）。
   * 続きで Claude Code が読むのは最後の圧縮の要約から後ろなので、会話の中身は変わらない。切り出せなければ丸ごと写す
   */
  async fork(sessionId: string, messageId: string, cwd: string, opts: { keep?: number } = {}): Promise<string> {
    const file = await findSessionFile(sessionId, [cwd]).catch(() => null);
    const recent = file ? await writeRecentSegments(file, sessionId, messageId, opts.keep).catch(() => null) : null;
    if (recent) {
      try {
        return (await forkSession(recent.sessionId, { upToMessageId: messageId })).sessionId;
      } catch {
        // 切り出したものを写せなければ、丸ごと写す
      } finally {
        await removeSession(recent.path).catch(() => {});
      }
    }
    try {
      return (await forkSession(sessionId, { dir: cwd, upToMessageId: messageId })).sessionId;
    } catch {
      return (await forkSession(sessionId, { upToMessageId: messageId })).sessionId;
    }
  }

  /** チャットを消したとき、そのセッションの記録をゴミ箱へ移す（cwds は動かした作業フォルダの候補。見つからなければすべてのプロジェクトから探す） */
  async discardSessions(sessionIds: string[], cwds: string[], trash: (path: string) => Promise<void>): Promise<number> {
    return trashSessions(sessionIds, cwds, trash);
  }

  /** 長く続けたセッションを、終わりの直近 3 区切りだけの新しいセッションにする（sessionFiles.ts の trimToRecentSegments。切るものがなければ null） */
  async trimSession(sessionId: string, cwd: string): Promise<{ sessionId: string; previousFile: string } | null> {
    const file = await findSessionFile(sessionId, [cwd]).catch(() => null);
    if (!file) return null;
    const trimmed = await trimToRecentSegments(file, sessionId);
    return trimmed ? { sessionId: trimmed.sessionId, previousFile: file } : null;
  }

  /** 作業場所を移すとき、会話を新しいセッションに写す（sessionFiles.ts の copyForWorkplaceMove。元の記録が見つからなければ null） */
  async copySessionForMove(sessionId: string, cwd: string): Promise<{ sessionId: string; previousFile: string } | null> {
    const file = await findSessionFile(sessionId, [cwd]).catch(() => null);
    if (!file) return null;
    const copied = await copyForWorkplaceMove(file, sessionId);
    return { sessionId: copied.sessionId, previousFile: file };
  }

  /** セッションの記録のファイルの様子（Kickoff が作ったセッションの片付け） */
  async sessionInfo(sessionId: string, cwds: string[]): Promise<SessionFileInfo | null> {
    return sessionFileInfo(sessionId, cwds);
  }

  /** すべての会話記録のファイル（どのチャットも使っていない記録の一覧） */
  async listSessionFiles(): Promise<SessionFileInfo[]> {
    return listSessionFiles();
  }

  /** セッションの記録のファイルの大きさの合計（作業フォルダから決まる場所だけを見る。アーカイブ済みのチャットの整理の見込み） */
  async sessionsSize(sessionIds: string[], cwds: string[]): Promise<number> {
    return sessionFilesSize(sessionIds, cwds);
  }

  /** サブエージェントの会話を記録から読む（cwd のプロジェクトで見つからなければ、すべてのプロジェクトから探す。なければ空） */
  async subagentLog(sessionId: string, agentId: string, cwd: string): Promise<SubagentLogItem[]> {
    let messages = await getSubagentMessages(sessionId, agentId, { dir: cwd }).catch(() => []);
    if (messages.length === 0) messages = await getSubagentMessages(sessionId, agentId).catch(() => []);
    return subagentLogOf(messages);
  }

  /** ファイルを、会話の自分の発言（messageId）を送る前の状態に戻す（dryRun なら戻さずに量だけ）。発言は送らずにセッションを開いて頼む */
  async rewindFiles(sessionId: string, messageId: string, cwd: string, dryRun: boolean): Promise<FileRewindResult> {
    const result = await this.withIdleSession((q) => q.rewindFiles(messageId, { dryRun }), { cwd, resume: sessionId, enableFileCheckpointing: true });
    return {
      can_rewind: result.canRewind,
      ...(result.error ? { error: result.error } : {}),
      ...(result.filesChanged ? { files_changed: result.filesChanged } : {}),
      ...(result.insertions !== undefined ? { insertions: result.insertions } : {}),
      ...(result.deletions !== undefined ? { deletions: result.deletions } : {}),
    };
  }

  /** 最初のメッセージから短いチャット名を作る（軽いモデルで 1 回だけ問い合わせる） */
  async title(text: string): Promise<string> {
    return cleanTitle(await this.askOnce(titlePrompt(text)));
  }

  async summarize(text: string): Promise<string> {
    return (await this.askOnce(summarizePrompt(text))).trim();
  }

  async ask(prompt: string, options?: { model?: AskModel }): Promise<string> {
    return (await this.askOnce(prompt, options?.model)).trim();
  }

  /**
   * ツールを使わずに 1 回だけ聞く（名前を付ける・要約する・メモの整理。チャットの記録には残さない。既定は軽い段 = haiku）。
   * 空の一時フォルダで動かす（Kickoff を起動したフォルダで動かすと、そこの CLAUDE.md・自動のメモリーを読み込み、答えに混ざる）。
   * 会話記録は残さない（persistSession: false。続けることはなく、残すとチャットを作るたびに ~/.claude/projects に使わない記録が 1 つずつ増えていた）
   */
  private async askOnce(prompt: string, tier: AskModel = "light"): Promise<string> {
    const q = query({
      prompt,
      options: {
        persistSession: false,
        cwd: os.tmpdir(),
        model: ASK_MODELS[tier],
        effort: "low",
        maxTurns: 1,
        tools: [],
        settingSources: [],
        env: agentEnv(),
        pathToClaudeCodeExecutable: this.executable,
      },
    });
    try {
      let result = "";
      for await (const msg of q) {
        if (msg.type === "result" && msg.subtype === "success") result = msg.result;
      }
      return result;
    } finally {
      // 途中で失敗しても Claude Code のプロセスを残さない（withIdleSession と同じ）
      q.close();
    }
  }
}
