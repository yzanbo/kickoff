import type { AgentProvider, ProviderCallbacks, ProviderTurnParams, ProviderTurnResult, SessionFileInfo, SessionStore, SubagentLogItem } from "@/features/ai/core/providers/types";
import type { FileRewindResult, ProviderCliStatus, SlashCommandOption, EffortDefault, ModelOption } from "@shared/ai/types";
import type { ApiRetryInfo, BackgroundState } from "@shared/ai/turnEvents";
import { claudeEffortDefault } from "@/features/ai/core/providers/claude/effortDefault";
import { summarizePrompt, titlePrompt } from "@/features/ai/core/providers/askPrompts";

/** テスト用の偽のプロバイダーの土台（いつもログイン済み）。run の振る舞いはテストごとに決める。テストからだけ使う */
export abstract class FakeProviderBase implements AgentProvider {
  readonly id = "claude" as const;
  readonly label = "Fake";
  readonly implemented = true;

  async status(): Promise<ProviderCliStatus> {
    return { id: this.id, label: this.label, implemented: true, installed: true, logged_in: true, detail: "" };
  }

  /** 推論の深さの既定は本物の Claude と同じに設定のファイルから読む（偽物は id が claude） */
  effortDefault(model: string | null, cwd: string): Promise<EffortDefault> {
    return claudeEffortDefault(model, cwd);
  }

  abstract run(params: ProviderTurnParams, callbacks: ProviderCallbacks, signal: AbortSignal): Promise<ProviderTurnResult>;
}

/** 実行の台本（渡された値と知らせ先を見て、結果を返す） */
export type Script = (params: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal) => Promise<ProviderTurnResult>;

/** 台本どおりに振る舞う偽のプロバイダー（渡された値を順に覚える） */
export class ScriptedProvider extends FakeProviderBase {
  calls: ProviderTurnParams[] = [];
  constructor(private readonly script: Script) {
    super();
  }
  run(params: ProviderTurnParams, cb: ProviderCallbacks, signal: AbortSignal) {
    this.calls.push(params);
    return this.script(params, cb, signal);
  }
}

/** 外から終わらせるまで作業中のままの台本（gates の関数を呼ぶと、その回が完了する。止められたら cancelled） */
export function gatedScript() {
  const gates: (() => void)[] = [];
  const script: Script = (params, _cb, signal) =>
    new Promise((resolve) => {
      gates.push(() => resolve({ status: "completed", sessionId: "s", turns: 1, result: params.prompt }));
      signal.addEventListener("abort", () => resolve({ status: "cancelled", sessionId: "s" }), { once: true });
    });
  return { gates, script };
}

/** すぐに完了する偽のプロバイダー（API のテストの既定。渡したもの・呼ばれた回数を覚え、止める・失敗させる口を持つ） */
export class FakeProvider extends FakeProviderBase {
  /** 最後に動かした作業フォルダ（チャットの作業場所の確かめに使う） */
  lastCwd = "";
  /** 渡した指示（順に） */
  prompts: string[] = [];
  /** 続きから再開した会話（順に。新しい会話なら null） */
  resumes: (string | null)[] = [];
  /** これが 1 以上なら、次の実行を通信の切断で失敗させる（1 回ごとに減らす） */
  networkFailures = 0;
  /** ここに入れた分だけ、次の実行を使用枠の上限で失敗させる（値は枠が戻る時刻。1 回ごとに先頭を使う） */
  usageLimits: (string | null)[] = [];
  /** 実行の初めに記録する途中経過（返答・ツールの実行など。作業中の未読の確かめに使う） */
  emits: Parameters<ProviderCallbacks["emit"]>[0][] = [];
  /** 実行の初めに知らせる、裏で動いている作業の様子（裏の作業の表示の確かめに使う） */
  background: BackgroundState | null = null;
  /** true なら実行の初めに、会話を圧縮し始めたと知らせる（終わりは知らせない。作業の終わりで消えるかの確かめに使う） */
  compacting = false;
  /** いまの実行の圧縮を終える（作業を続けたまま、圧縮が終わったと知らせる。作業中の圧縮のあとの確かめに使う） */
  finishCompacting: () => void = () => {};
  /** いまの実行で要約が済んだと知らせる（Claude Code の compact_boundary と同じく、要約の記録を残してから圧縮中を外す） */
  compactBoundary: () => void = () => {};
  /** これが true なら、/compact の実行で要約の記録（compact）を知らせる（手で圧縮したあとの確かめに使う） */
  emitCompactOnCompact = false;
  /** これがあれば実行の初めに、作業の途中のコンテキストの大きさ（圧縮の直後）として知らせる */
  contextTokens: number | null = null;
  /** これがあれば実行の初めに、AI の API への通信を再試行していると知らせる（終わりは知らせない。作業の終わりで消えるかの確かめに使う） */
  retry: ApiRetryInfo | null = null;
  /** 作業中に足された発言（止めずに伝える）と、止めた裏の作業。acceptTell が false なら足せない（入力が閉じている） */
  told: string[] = [];
  stoppedTasks: string[] = [];
  acceptTell = true;
  /** これがあれば、外から release するまで作業中のままにする（止められたら cancelled） */
  private gate: Promise<void> | null = null;
  /** これがあれば、止められてもすぐには終わらない（サブエージェント・裏のコマンドが終わるのを待つ Claude Code の代わり） */
  slowStop: Promise<void> | null = null;
  /** 最後に読めるようにしたフォルダと、足したシステムプロンプト（ノートのチャットの確かめに使う） */
  lastDirs: string[] = [];
  lastSystemPrompt = "";
  /** 最後に指示に添えた文脈（子チャットの親など。なければ null） */
  lastTurnContext: string | null = null;
  /** 実行ごとに渡された、自動の圧縮の前に足す圧縮前指示（順に） */
  preCompacts: ProviderTurnParams["preCompact"][] = [];
  /** これがあれば実行の初めに、自動の圧縮の前に圧縮前指示を足したと知らせる（値は足した発言の ID） */
  preCompactSentId: string | null = null;
  /** 最後の実行が、Git で管理していないファイルだけを書けるチャットだったか（［AI で整える］の確かめに使う） */
  lastUntrackedOnly = false;
  /** 最後の実行に渡したモデル（一覧にないモデルを外す確かめに使う） */
  lastModel: string | null = null;
  /** モデルの一覧（テストで入れる。なければ一覧を持たない AI） */
  models?: () => Promise<ModelOption[]>;
  async run(
    params: { cwd: string; model?: string | null; prompt: string; promptId?: string; resumeSessionId: string | null; additionalDirectories: string[]; systemPrompt: string; preCompact?: ProviderTurnParams["preCompact"]; turnContext?: string | null; untrackedOnly?: boolean },
    cb: Pick<ProviderCallbacks, "emit" | "background" | "compacting" | "context" | "control" | "retry" | "preCompactSent">,
    signal: AbortSignal,
  ): Promise<ProviderTurnResult> {
    this.lastCwd = params.cwd;
    this.lastModel = params.model ?? null;
    this.preCompacts.push(params.preCompact ?? null);
    if (params.preCompact && this.preCompactSentId) cb.preCompactSent?.(this.preCompactSentId);
    this.lastDirs = params.additionalDirectories;
    this.lastSystemPrompt = params.systemPrompt;
    this.lastTurnContext = params.turnContext ?? null;
    this.lastUntrackedOnly = params.untrackedOnly ?? false;
    this.prompts.push(params.prompt);
    this.promptIds.push(params.promptId);
    this.resumes.push(params.resumeSessionId);
    this.emits.forEach((event) => cb.emit(event));
    if (this.background) cb.background?.(this.background);
    if (this.compacting) cb.compacting?.(true);
    this.finishCompacting = () => cb.compacting?.(false);
    this.compactBoundary = () => {
      cb.emit({ type: "compact", trigger: "auto", pre_tokens: 1000 });
      cb.compacting?.(false);
    };
    if (this.emitCompactOnCompact && params.prompt === "/compact") cb.emit({ type: "compact", trigger: "manual", pre_tokens: 1000 });
    if (this.contextTokens !== null) cb.context?.(this.contextTokens);
    if (this.retry) cb.retry?.(this.retry);
    cb.control?.({
      tell: (text) => this.acceptTell && Boolean(this.told.push(text)),
      stopTask: async (taskId) => void this.stoppedTasks.push(taskId),
    });
    if (this.gate) {
      const aborted = new Promise<"aborted">((resolve) => signal.addEventListener("abort", () => resolve("aborted"), { once: true }));
      if ((await Promise.race([this.gate, aborted])) === "aborted") {
        await this.slowStop;
        return { status: "cancelled", sessionId: "s1" };
      }
    }
    if (this.usageLimits.length > 0) {
      const resetsAt = this.usageLimits.shift()!;
      return { status: "failed", sessionId: "s1", error: "Claude AI usage limit reached", usageLimit: { resetsAt } };
    }
    if (this.networkFailures > 0) {
      this.networkFailures--;
      return { status: "failed", sessionId: "s1", error: "API Error: Connection error.", network: true };
    }
    return { status: "completed", sessionId: "s1", result: "ok", turns: 1, lastMessageId: `m${this.prompts.length}` };
  }
  /** 分岐したときの引数（会話・位置・作業フォルダ） */
  forks: [string, string, string][] = [];
  /** ファイルを戻した呼び出し（会話・発言の ID・作業フォルダ・dryRun）と、返す結果 */
  rewinds: [string, string, string, boolean][] = [];
  rewindResult: FileRewindResult = { can_rewind: true, files_changed: ["/r/a.ts", "/r/b.ts"], insertions: 3, deletions: 1 };
  async rewindFiles(sessionId: string, messageId: string, cwd: string, dryRun: boolean) {
    this.rewinds.push([sessionId, messageId, cwd, dryRun]);
    return this.rewindResult;
  }
  /** 渡した指示の ID（自分の発言の記録の message_uuid と同じもの） */
  promptIds: (string | undefined)[] = [];
  /** 分岐を返すまで待たせる（親の会話が長くて写すのに時間がかかるとき。holdFork で立てる）と、写せないときの失敗 */
  private forkGate: Promise<void> | null = null;
  forkError: string | null = null;
  async fork(sessionId: string, messageId: string, cwd: string) {
    this.forks.push([sessionId, messageId, cwd]);
    const n = this.forks.length;
    if (this.forkGate) await this.forkGate;
    if (this.forkError) throw new Error(this.forkError);
    return `fork-${n}`;
  }
  /** 作業場所を移すときに写したセッション（元の会話・作業フォルダ）と、写せないときの失敗 */
  copies: [string, string][] = [];
  copyError: string | null = null;
  /** すべての会話記録のファイル（どのチャットも使っていない記録の一覧の元。テストで入れる） */
  sessionFiles: SessionFileInfo[] = [];
  /** チャットを消したときにゴミ箱へ移すよう頼まれたセッション（頼まれた順。cwds は作業フォルダの候補） */
  discarded: { sessionIds: string[]; cwds: string[] }[] = [];
  /** 会話記録の口（写す・一覧・ゴミ箱へだけ。切り出し・様子・大きさは持たない） */
  readonly sessions: SessionStore = {
    copyForMove: async (sessionId, cwd) => {
      this.copies.push([sessionId, cwd]);
      if (this.copyError) throw new Error(this.copyError);
      return { sessionId: `moved-${this.copies.length}`, previousFile: `/sessions/${sessionId}.jsonl` };
    },
    list: async () => this.sessionFiles,
    discard: async (sessionIds, cwds) => {
      this.discarded.push({ sessionIds, cwds });
      return sessionIds.length;
    },
  };
  /** 次からの分岐を、返した関数を呼ぶまで返さない */
  holdFork(): () => void {
    let release = () => {};
    this.forkGate = new Promise((resolve) => (release = () => ((this.forkGate = null), resolve())));
    return release;
  }
  /** サブエージェントの会話（サブエージェントの ID ごと。なければ空）と、読んだ呼び出し（親のセッション・ID・作業フォルダ） */
  subagentLogs: Record<string, SubagentLogItem[]> = {};
  subagentLogCalls: [string, string, string][] = [];
  async subagentLog(sessionId: string, agentId: string, cwd: string) {
    this.subagentLogCalls.push([sessionId, agentId, cwd]);
    return this.subagentLogs[agentId] ?? [];
  }
  /** 次からの実行を、返した関数を呼ぶまで作業中のままにする */
  hold(): () => void {
    let release = () => {};
    this.gate = new Promise((resolve) => (release = () => ((this.gate = null), resolve())));
    return release;
  }
  /** 要約に渡した文（askSummary の頼み。順に）。返すのは「要約: 」＋ 先頭の 10 文字 */
  summarized: string[] = [];
  /**
   * 1 回だけ聞いた文とモデル（順に）。返すのは askReply（関数なら聞いた文から作る。なければ「答え: 」＋ 文の最後の行）。
   * チャットの名前の頼み（askTitle）には答えず（偽物は名前を付けない）、要約の頼み（askSummary）は summarized に分けて覚える
   */
  asked: { prompt: string; model: string | undefined }[] = [];
  askReply: string | ((prompt: string) => string) | null = null;
  async ask(prompt: string, options?: { model?: string }) {
    if (prompt.startsWith(titlePrompt(""))) throw new Error("偽のプロバイダーは名前を付けません");
    if (prompt.startsWith(summarizePrompt(""))) {
      const text = prompt.slice(summarizePrompt("").length);
      this.summarized.push(text);
      return `要約: ${text.slice(0, 10)}`;
    }
    this.asked.push({ prompt, model: options?.model });
    if (typeof this.askReply === "function") return this.askReply(prompt);
    return this.askReply ?? `答え: ${prompt.split("\n").at(-1)}`;
  }
  /** チャット欄の / のコマンド（返すものと、調べた作業フォルダ） */
  commandList: SlashCommandOption[] = [];
  lastCommandsCwd = "";
  async commands(cwd: string) {
    this.lastCommandsCwd = cwd;
    return this.commandList;
  }
}
