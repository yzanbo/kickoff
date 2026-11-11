// API のテスト（server.*.test.ts）の共通の準備: 偽のプロバイダーでアプリを組み立て、トークン付きで呼ぶ補助を返す。テストからだけ使う
import fs from "node:fs/promises";
import type { ProviderCallbacks, ProviderTurnParams, ProviderTurnResult, SubagentLogItem } from "../providers/types.js";
import { createApp } from "../http/server.js";
import type { ApiRetryInfo, BackgroundState, FileRewindResult, GitHubAccount, SlashCommandOption } from "@shared/types";
import { UploadStore } from "../chat/uploads.js";
import { ServiceUsageMonitor } from "../usage/services/index.js";
import { VoiceService } from "../voice/service.js";
import { WorktreePrWatch } from "../git/prWatch.js";
import { listWorktrees } from "../git/worktrees.js";
import type { BranchPullRequest } from "../git/github.js";
import { MemoService } from "../memos/memos.js";
import type { VoiceTools } from "../voice/tools.js";
import type { MacosSpeech } from "../voice/macos.js";
import type { AudioInput, LocalOptions, MacosOptions, OpenAiOptions } from "../voice/types.js";
import type { SpeechOptions } from "../voice/speech.js";
import { FakeProviderBase } from "./fakeProvider.js";
import "./gitRepo.js";
import { tempDir } from "./tempDir.js";
import { setupCore } from "./testCore.js";

export { until } from "./testCore.js";

export const TOKEN = "t".repeat(32);
export const AUTH = { authorization: `Bearer ${TOKEN}` };

/** すぐに完了する偽のプロバイダー */
class FakeProvider extends FakeProviderBase {
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
  /** 最後に読めるようにしたフォルダと、足したシステムプロンプト（メモのチャットの確かめに使う） */
  lastDirs: string[] = [];
  lastSystemPrompt = "";
  /** 最後に指示に添えた文脈（子チャットの親など。なければ null） */
  lastTurnContext: string | null = null;
  /** 実行ごとに渡された、自動の圧縮の前に足す圧縮前指示（順に） */
  preCompacts: ProviderTurnParams["preCompact"][] = [];
  /** これがあれば実行の初めに、自動の圧縮の前に圧縮前指示を足したと知らせる（値は足した発言の ID） */
  preCompactSentId: string | null = null;
  async run(
    params: { cwd: string; prompt: string; promptId?: string; resumeSessionId: string | null; additionalDirectories: string[]; systemPrompt: string; preCompact?: ProviderTurnParams["preCompact"]; turnContext?: string | null },
    cb: Pick<ProviderCallbacks, "emit" | "background" | "compacting" | "context" | "control" | "retry" | "preCompactSent">,
    signal: AbortSignal,
  ): Promise<ProviderTurnResult> {
    this.lastCwd = params.cwd;
    this.preCompacts.push(params.preCompact ?? null);
    if (params.preCompact && this.preCompactSentId) cb.preCompactSent?.(this.preCompactSentId);
    this.lastDirs = params.additionalDirectories;
    this.lastSystemPrompt = params.systemPrompt;
    this.lastTurnContext = params.turnContext ?? null;
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
  async fork(sessionId: string, messageId: string, cwd: string) {
    this.forks.push([sessionId, messageId, cwd]);
    return `fork-${this.forks.length}`;
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
  /** 要約に渡した文（順に）。返すのは「要約: 」＋ 先頭の 10 文字 */
  summarized: string[] = [];
  async summarize(text: string) {
    this.summarized.push(text);
    return `要約: ${text.slice(0, 10)}`;
  }
  /** 1 回だけ聞いた文とモデル（順に）。返すのは askReply（関数なら聞いた文から作る。なければ「答え: 」＋ 文の最後の行） */
  asked: { prompt: string; model: string | undefined }[] = [];
  askReply: string | ((prompt: string) => string) | null = null;
  async ask(prompt: string, options?: { model?: string }) {
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

/**
 * 偽のプロバイダーで API のアプリを組み立てる（一時フォルダは、そのテストが終わったら消える）。
 * Git の名前は、設定していない環境でもコミットできるよう testing/gitRepo.ts が環境変数で渡す
 */
export function setup(opts: { staticDir?: string } = {}) {
  const uploads = new UploadStore(tempDir());
  // 通信: online を false にすると AI の API に届かない（つながったかの確かめに使う）
  const network = { online: true };
  const { bus, store, approvals, providers, usage, runner, provider, project } = setupCore(new FakeProvider(), {
    uploads,
    reconnect: { check: async () => network.online, intervalMs: 5 },
    usageLimit: { checkMs: 5 },
    // 書き直している印は短い持ち時間にする（知らせが途絶えたら外れて送るのを確かめる）
    editHoldTtlMs: 300,
    // メモのチャットの実行では、メモのフォルダも読めるようにする（MemoService は下で作るので、呼ばれたときに引く）
    memoDirOf: (p) => memos.dirOf(p),
  });
  // ほかのサービスは、ネットワークに出ない偽物にする
  let codexCalls = 0;
  const serviceUsage = new ServiceUsageMonitor(usage, [
    {
      id: "codex",
      label: "Codex",
      fetch: async () => {
        codexCalls++;
        return { id: "codex", label: "Codex", status: "ok", plan: "plus", account: null, windows: [], notes: [], fetched_at: new Date().toISOString() };
      },
    },
    { id: "cursor", label: "Cursor", fetch: async () => Promise.reject(new Error("つながりません")) },
  ]);
  // 音声入力: 文字起こしとコマンドの探し方・ダウンロードを偽物にする（呼ばれた方法と値を覚える）
  const voiceFake = {
    tools: { whisper: "/fake/whisper-cli", ffmpeg: "/fake/ffmpeg" } as VoiceTools,
    /** macOS の音声認識の様子（確かめで返す） */
    speech: { helper: true, available: true, locale: "ja-JP", installed: true } as MacosSpeech,
    calls: [] as { engine: "local" | "macos" | "openai"; audio: AudioInput; opts: LocalOptions | MacosOptions | OpenAiOptions }[],
    /** 読み上げを頼まれた文と値 */
    speeches: [] as { text: string; opts: SpeechOptions }[],
    /** ダウンロードで返す中身（Response を返す関数） */
    download: async (): Promise<Response> => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-length": "3" } }),
  };
  const voice = new VoiceService({
    store,
    modelsDir: tempDir(),
    speechHelper: "/fake/kickoff-speech",
    publish: (e) => bus.publish(e),
    engines: {
      local: async (audio, opts) => (voiceFake.calls.push({ engine: "local", audio, opts }), "ローカルの文"),
      macos: async (audio, opts) => (voiceFake.calls.push({ engine: "macos", audio, opts }), "macOS の文"),
      openai: async (audio, opts) => (voiceFake.calls.push({ engine: "openai", audio, opts }), "OpenAI の文"),
      speech: async (text, opts) => (voiceFake.speeches.push({ text, opts }), new Uint8Array([9, 8, 7])),
    },
    findTools: async () => voiceFake.tools,
    checkSpeech: async () => voiceFake.speech,
    fetch: () => voiceFake.download(),
  });
  // メモ: 親フォルダの既定は一時フォルダ。ゴミ箱へ移すのは本物のゴミ箱に入れず、消して覚える
  // （ファイルタブの「ゴミ箱に入れる」も同じ。memoFake.trashed に覚える）
  const memoFake = { defaultDir: tempDir(), trashed: [] as string[] };
  const trash = async (file: string) => {
    memoFake.trashed.push(file);
    await fs.rm(file, { recursive: true });
  };
  const memos = new MemoService({ store, defaultDir: memoFake.defaultDir, providers, publish: (e) => bus.publish(e), trash });
  // ワークツリーの PR の見張り: ワークツリーは本物の git、PR の一覧は偽物（prFake.prs を返し、聞いた回数を覚える。失敗させるなら fail）
  const prFake = { prs: [] as BranchPullRequest[], asked: 0, fail: false };
  // gh に入っている GitHub のアカウント（設定の「GitHub」。gh を呼ばない）
  const githubFake = { accounts: [{ login: "me", active: true, ok: true }, { login: "work", active: false, ok: true }] as GitHubAccount[] };
  const prWatch = new WorktreePrWatch({
    store,
    publish: (e) => bus.publish(e),
    listWorktrees,
    // 連携先は GitHub の o/r（手元のブランチも o にプッシュする）とみなす
    resolveTarget: async () => ({ repo: "o/r", headOwner: "o" }),
    listPullRequests: async () => {
      prFake.asked++;
      if (prFake.fail) throw new Error("gh が見つかりません");
      return prFake.prs;
    },
  });
  const app = createApp({ store, bus, token: TOKEN, providers, usage, serviceUsage, runner, approvals, uploads, voice, memos, prWatch, trash, githubAccounts: async () => githubFake.accounts, staticDir: opts.staticDir });

  /** トークン付きで API を呼び、JSON の応答を返す */
  const call = async (method: string, url: string, body?: unknown) => {
    const res = await app.request(url, {
      method,
      headers: body === undefined ? AUTH : { ...AUTH, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  };
  return { app, store, bus, runner, project, call, provider, uploads, voiceFake, memoFake, prFake, githubFake, prWatch, network, approvals, codexCalls: () => codexCalls };
}

