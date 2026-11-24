import os from "node:os";
import { bundledClaudeVersion, resolveClaudeExecutable, type Query } from "./wire";
import { realClaudeSdk, type ClaudeProviderOptions, type ClaudeSdk } from "./sdk";
import { claudeSessionStore, findSessionFile, removeSession, writeRecentSegments } from "./sessionFiles";
import { errorMessage } from "@shared/foundation/errors";
import { TERMINAL_ONLY_COMMANDS } from "./labels";
import type { FileRewindResult, ProviderCliStatus, SlashCommandOption, EffortDefault, ModelOption } from "@shared/ai/types";
import { EFFORT_LEVELS, type EffortLevel } from "@shared/settings/types";
import { agentEnv } from "./env";
import type { ClaudeAuthStatus } from "./internals";
import { subagentLogOf } from "./subagentLog";
import { withIdleSession } from "./idleSession";
import type { AgentProvider, AskModel, ProviderCallbacks, ProviderTurnParams, ProviderTurnResult, SubagentLogItem, WriteExceptions } from "@/features/ai/core/providers/types";
import { runCommand } from "@/foundation/core/system/exec";
import { CLEAR_COMMAND_DESCRIPTION } from "@shared/ai/commands";
import { claudeEffortDefault } from "./effortDefault";
import { runClaudeTurn } from "./run";
import { claudeWriteExceptions } from "./policy";

/** 1 回だけ聞くときの段ごとのモデル（AskModel。軽い = haiku・ふつう = sonnet） */
const ASK_MODELS: Record<AskModel, string> = { light: "haiku", standard: "sonnet" };

export class ClaudeProvider implements AgentProvider {
  readonly id = "claude" as const;
  readonly label = "Claude Code";
  readonly implemented = true;
  readonly sessions = claudeSessionStore;
  /** Claude Code の計画とメモリ（CLAUDE_CONFIG_DIR を実行のたびに読む） */
  get writeExceptions(): WriteExceptions {
    return claudeWriteExceptions();
  }
  private readonly sdk: ClaudeSdk;
  private readonly executable: string | undefined;

  constructor(opts: ClaudeProviderOptions = {}) {
    this.sdk = opts.sdk ?? realClaudeSdk;
    this.executable = opts.executable ?? resolveClaudeExecutable();
  }

  async status(): Promise<ProviderCliStatus> {
    // 同梱の Claude Code の版（設定の「接続」に出す。上げるのは Kickoff の開発の側なので、新しい版の知らせはここでは出さない）
    const base = { id: this.id, label: this.label, implemented: true, version: bundledClaudeVersion(), bundled: true };
    if (!this.executable) {
      return { ...base, installed: false, logged_in: false, detail: "Claude Code のバイナリが見つかりません" };
    }
    try {
      const stdout = await runCommand(this.executable, ["auth", "status"], { env: agentEnv(), timeout: 20_000 });
      const info = JSON.parse(stdout) as ClaudeAuthStatus;
      const plan = info.subscriptionType ?? undefined;
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

  /** メッセージを送らないセッションで制御の API だけを呼ぶ（idleSession.ts。使用枠を消費しない） */
  private withIdleSession<T>(fn: (q: Query) => Promise<T>, extra: Parameters<typeof withIdleSession>[2] = {}): Promise<T> {
    return withIdleSession({ query: this.sdk.query, executable: this.executable }, fn, extra);
  }

  /** 1 回の実行（run.ts。SDK の口はテストで偽物に差し替えられる） */
  run(params: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult> {
    return runClaudeTurn({ query: this.sdk.query, executable: this.executable }, params, cb, signal);
  }

  /**
   * 会話を messageId の位置までで分け、新しいセッションにする（元のセッションは変えない）。
   * cwd はそのセッションを動かした作業フォルダ（消えていれば、すべてのプロジェクトから探す）。
   * 写すのは位置の手前の直近 keep 区切り（圧縮の印から後ろ。既定 FORK_KEEP_SEGMENTS = 3、子チャットは 1）だけ: Claude Code は圧縮しても古いやり取りを消さないので、
   * 長く続けた会話を丸ごと写すと 1GB を超え、本体が数秒ずつ止まる（1.6GB の親で約 18 秒 → 直近 2 区切りで約 0.2 秒・約 6MB）。
   * 続きで Claude Code が読むのは最後の圧縮の要約から後ろなので、会話の中身は変わらない。切り出せなければ丸ごと写す
   */
  async fork(sessionId: string, messageId: string, cwd: string, opts: { keep?: number } = {}): Promise<string> {
    const file = await findSessionFile(sessionId, [cwd]).catch(() => null);
    const recent = file ? await writeRecentSegments(file, sessionId, messageId, opts.keep).catch(() => null) : null;
    if (recent) {
      try {
        return (await this.sdk.forkSession(recent.sessionId, { upToMessageId: messageId })).sessionId;
      } catch {
        // 切り出したものを写せなければ、丸ごと写す
      } finally {
        await removeSession(recent.path).catch(() => {});
      }
    }
    try {
      return (await this.sdk.forkSession(sessionId, { dir: cwd, upToMessageId: messageId })).sessionId;
    } catch {
      return (await this.sdk.forkSession(sessionId, { upToMessageId: messageId })).sessionId;
    }
  }

  /** 推論の深さの既定（環境変数と Claude Code の設定ファイル。effortDefault.ts） */
  effortDefault(model: string | null, cwd: string): Promise<EffortDefault> {
    return claudeEffortDefault(model, cwd);
  }

  /** サブエージェントの会話を記録から読む（cwd のプロジェクトで見つからなければ、すべてのプロジェクトから探す。なければ空） */
  async subagentLog(sessionId: string, agentId: string, cwd: string): Promise<SubagentLogItem[]> {
    let messages = await this.sdk.getSubagentMessages(sessionId, agentId, { dir: cwd }).catch(() => []);
    if (messages.length === 0) messages = await this.sdk.getSubagentMessages(sessionId, agentId).catch(() => []);
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
  async ask(prompt: string, options?: { model?: AskModel }): Promise<string> {
    return (await this.askOnce(prompt, options?.model)).trim();
  }

  /**
   * ツールを使わずに 1 回だけ聞く（名前を付ける・要約する・ノートの整理。チャットの記録には残さない。既定は軽い段 = haiku）。
   * 空の一時フォルダで動かす（Kickoff を起動したフォルダで動かすと、そこの CLAUDE.md・自動のメモリーを読み込み、答えに混ざる）。
   * 会話記録は残さない（persistSession: false。続けることはなく、残すとチャットを作るたびに ~/.claude/projects に使わない記録が 1 つずつ増えていた）
   */
  private async askOnce(prompt: string, tier: AskModel = "light"): Promise<string> {
    const q = this.sdk.query({
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
