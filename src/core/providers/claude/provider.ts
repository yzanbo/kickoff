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
import { BROWSER_SERVER, browserMcpServer, browserReadOnlyTools } from "./browserTools.js";
import { DB_SERVER, dbMcpServer, dbToolNames } from "./dbTools.js";
import { CHAT_SERVER, chatMcpServer, chatToolNames } from "./chatTools.js";
import { agentEnv, resolveClaudeExecutable } from "./env.js";
import { createMessageState, emitSdkMessage } from "./messages.js";
import { subagentLogOf } from "./subagentLog.js";
import { turnContextHook, turnHooks, toAllowedTools } from "./policy.js";
import type { SelfInfo } from "../../chat/guard/selfProtection.js";
import { normalizeUsage, readPlanDisplayName } from "./usage.js";
import type { AgentProvider, AskModel, ProviderCallbacks, ProviderTurnParams, ProviderTurnResult, SubagentLogItem } from "../types.js";
import { runCommand } from "../../system/exec.js";
import { CLEAR_COMMAND_DESCRIPTION } from "@shared/chat/queueActions";

/** 要約に渡す文の上限（文字。haiku のコンテキストと時間に収める） */
const MAX_SUMMARIZE_CHARS = 60_000;

export class ClaudeProvider implements AgentProvider {
  readonly id = "claude" as const;
  readonly label = "Claude Code";
  readonly implemented = true;
  private readonly executable = resolveClaudeExecutable();

  /** self: エージェントを動かしている Kickoff 自身（自分を壊すツールの呼び出しを断るのに使う） */
  constructor(private readonly self?: SelfInfo) {}

  async status(): Promise<ProviderStatus> {
    const base = { id: this.id, label: this.label, implemented: true };
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
          supports_fast_mode: Boolean(m.supportsFastMode),
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
    // Kickoff の埋め込みブラウザを操作するツール（デスクトップアプリのときだけ）・プロジェクトの DB を読むツール（AI に見せる接続があるときだけ）・
    // 自分の子チャットを作るツール（設定で止めていない・深さの上限に達していないときだけ）
    const mcpServers = {
      ...(params.browser ? { [BROWSER_SERVER]: browserMcpServer(params.browser.control, params.browser) } : {}),
      ...(params.database ? { [DB_SERVER]: dbMcpServer(params.database, cb, abortController.signal) } : {}),
      ...(params.childChat ? { [CHAT_SERVER]: chatMcpServer(params.childChat, cb, abortController.signal) } : {}),
    };

    let sessionId = params.resumeSessionId;
    let final: SDKResultMessage | undefined;
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
    // 実行中のコマンドの出力（Claude Code が書いているファイルを読み続け、終わる前から画面に届ける）
    const commandOutput = createCommandOutputWatcher((output) => cb.commandOutput?.(output));
    // 上限に近づいて自動で圧縮する前に、圧縮前指示を足して済ませてもらう（PreCompact フックで圧縮を止める）
    const preCompact = params.preCompact
      ? createPreCompactGate({ ...params.preCompact, push: (text, uuid) => input.push(text, uuid), onSent: (uuid) => cb.preCompactSent?.(uuid) })
      : null;
    try {
      const q = query({
        prompt: input.messages,
        options: {
          cwd: params.cwd,
          additionalDirectories: params.additionalDirectories,
          model: params.model || undefined,
          // 決めていなければ指定しない（SDK とモデルの既定に任せる）
          effort: params.effort ?? undefined,
          systemPrompt: { type: "preset", preset: "claude_code", append: params.systemPrompt },
          // ユーザーの ~/.claude（CLAUDE.md・スキル等）とリポジトリの設定を Claude Code と同様に読み込む
          settingSources: ["user", "project", "local"],
          permissionMode: params.permissionMode,
          // 埋め込みブラウザのツールのうち、見るだけのものは聞かずに使わせる（開く・押す・打つ・JS は権限モードと承認に従う）
          // DB のツール・子チャットのツールはすべて（承認と断りはツールの中で行う）
          allowedTools: [
            ...toAllowedTools(params.policy),
            ...(params.browser ? browserReadOnlyTools() : []),
            ...(params.database ? dbToolNames() : []),
            ...(params.childChat ? chatToolNames() : []),
          ],
          ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
          canUseTool,
          resume: params.resumeSessionId ?? undefined,
          abortController,
          // 自動圧縮を始める使用率を決めていれば渡す（決めていなければ Claude Code の既定）
          env: { ...agentEnv(), ...autoCompactEnv(params.autoCompactPct), ...params.env },
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
        },
      });

      // 作業中の発言の足し方と、裏の作業の止め方を Runner に渡す
      cb.control?.({ tell: (text, uuid) => input.push(text, uuid), stopTask: (taskId) => q.stopTask(taskId) });
      // 思考の時間を測る（流れてくる途中経過で始まりと終わりを見る）
      const messageState = createMessageState();
      // 裏で動いている作業と、メインの返答が終わったか（変わったときだけ知らせる）
      const trackBackground = createBackgroundTracker();
      for await (const msg of q) {
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
        if (background) {
          cb.background?.(background);
          // 返答を書き終え、裏の作業もなくなった: 入力を閉じて Claude Code を終わらせる（足した発言がまだ渡っていなければ閉じない）
          if (background.replied && background.tasks.length === 0) input.close();
        }
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
      }
    } catch (e) {
      if (signal.aborted) return { status: "cancelled", sessionId, lastMessageId };
      const error = errorMessage(e);
      return { status: "failed", sessionId, error, lastMessageId, network: network(error), ...usageLimit(error) };
    } finally {
      signal.removeEventListener("abort", onAbort);
      input.close(true);
      cb.control?.(null);
      commandOutput.stopAll();
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
   * cwd はそのセッションを動かした作業フォルダ（消えていれば、すべてのプロジェクトから探す）
   */
  async fork(sessionId: string, messageId: string, cwd: string): Promise<string> {
    try {
      return (await forkSession(sessionId, { dir: cwd, upToMessageId: messageId })).sessionId;
    } catch {
      return (await forkSession(sessionId, { upToMessageId: messageId })).sessionId;
    }
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
    const result = await this.askOnce(`次の依頼内容に、20 文字以内の日本語のタイトルを付けてください。タイトルだけを出力し、記号や引用符は付けないでください。\n\n---\n${text.slice(0, 2000)}`);
    return result.trim().replace(/^["'「『]|["'」』]$/g, "").split("\n")[0].slice(0, 40);
  }

  async summarize(text: string): Promise<string> {
    const result = await this.askOnce(
      `次の「---」より後ろの文を、あとで読み返すためのメモとして、日本語の Markdown で要点を短くまとめてください。` +
        `文に書いてあることだけを使い、書いていないこと（推測・助言・次にやること・ほかで知っている決まり）は足さないでください。` +
        `大事な決定・理由・手順・名前（ファイル名・コマンドなど）は残してください。短い文なら、ほぼそのままでかまいません。` +
        `前置きや「以下は要約です」などの文は書かず、まとめた本文だけを出力してください。見出し（#）は使わないでください。\n\n---\n${text.slice(0, MAX_SUMMARIZE_CHARS)}`,
    );
    return result.trim();
  }

  async ask(prompt: string, options?: { model?: AskModel }): Promise<string> {
    return (await this.askOnce(prompt, options?.model)).trim();
  }

  /**
   * ツールを使わずに 1 回だけ聞く（名前を付ける・要約する・メモの整理。チャットの記録には残さない。既定は haiku）。
   * 空の一時フォルダで動かす（Kickoff を起動したフォルダで動かすと、そこの CLAUDE.md・自動のメモリーを読み込み、答えに混ざる）
   */
  private async askOnce(prompt: string, model: AskModel = "haiku"): Promise<string> {
    const q = query({
      prompt,
      options: {
        cwd: os.tmpdir(),
        model,
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
