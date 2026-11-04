// API のテスト（server.*.test.ts）の共通の準備: 偽のプロバイダーでアプリを組み立て、トークン付きで呼ぶ補助を返す。テストからだけ使う
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApprovalCenter } from "../chat/approvals.js";
import { Bus } from "../bus.js";
import type { AgentProvider, ProviderCallbacks, ProviderRunResult } from "../providers/types.js";
import { Runner } from "../chat/runner.js";
import { createApp } from "../http/server.js";
import { Store } from "../db/store.js";
import type { BackgroundState, FileRewindResult, ProviderId, SlashCommandOption } from "@shared/types";
import { UploadStore } from "../chat/uploads.js";
import { ServiceUsageMonitor } from "../usage/services/index.js";
import { VoiceService } from "../voice/service.js";
import type { VoiceTools } from "../voice/tools.js";
import type { AudioInput, LocalOptions, OpenAiOptions } from "../voice/types.js";
import type { UsageMonitor } from "../usage/planUsage.js";
import { FakeProviderBase } from "./fakeProvider.js";

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
  /** 作業中に足された発言（止めずに伝える）と、止めた裏の作業。acceptTell が false なら足せない（入力が閉じている） */
  told: string[] = [];
  stoppedTasks: string[] = [];
  acceptTell = true;
  /** これがあれば、外から release するまで作業中のままにする（止められたら cancelled） */
  private gate: Promise<void> | null = null;
  /** これがあれば、止められてもすぐには終わらない（サブエージェント・裏のコマンドが終わるのを待つ Claude Code の代わり） */
  slowStop: Promise<void> | null = null;
  async run(params: { cwd: string; prompt: string; promptId?: string; resumeSessionId: string | null }, cb: Pick<ProviderCallbacks, "emit" | "background" | "compacting" | "control">, signal: AbortSignal): Promise<ProviderRunResult> {
    this.lastCwd = params.cwd;
    this.prompts.push(params.prompt);
    this.promptIds.push(params.promptId);
    this.resumes.push(params.resumeSessionId);
    this.emits.forEach((event) => cb.emit(event));
    if (this.background) cb.background?.(this.background);
    if (this.compacting) cb.compacting?.(true);
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
  rewindResult: FileRewindResult = { canRewind: true, filesChanged: ["/r/a.ts", "/r/b.ts"], insertions: 3, deletions: 1 };
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
  /** 次からの実行を、返した関数を呼ぶまで作業中のままにする */
  hold(): () => void {
    let release = () => {};
    this.gate = new Promise((resolve) => (release = () => ((this.gate = null), resolve())));
    return release;
  }
  /** チャット欄の / のコマンド（返すものと、調べた作業フォルダ） */
  commandList: SlashCommandOption[] = [];
  lastCommandsCwd = "";
  async commands(cwd: string) {
    this.lastCommandsCwd = cwd;
    return this.commandList;
  }
}

export const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-server-test-"));

export function setup(opts: { staticDir?: string } = {}) {
  const bus = new Bus();
  const store = new Store(":memory:", (e) => bus.publish(e));
  const approvals = new ApprovalCenter(bus);
  const uploads = new UploadStore(tempDir());
  const usage = { get: async () => ({ available: false }), refresh: async () => ({ available: false }) } as unknown as UsageMonitor;
  const provider = new FakeProvider();
  const providers = { claude: provider, codex: provider, gemini: provider } as Record<ProviderId, AgentProvider>;
  // 通信: online を false にすると AI の API に届かない（つながったかの確かめに使う）
  const network = { online: true };
  const runner = new Runner({
    store,
    approvals,
    providers,
    usage,
    uploads,
    bus,
    reconnect: { check: async () => network.online, intervalMs: 5 },
    usageLimit: { checkMs: 5 },
    // 書き直している印は短い持ち時間にする（知らせが途絶えたら外れて送るのを確かめる）
    editHoldTtlMs: 300,
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
    calls: [] as { engine: "local" | "openai"; audio: AudioInput; opts: LocalOptions | OpenAiOptions }[],
    /** ダウンロードで返す中身（Response を返す関数） */
    download: async (): Promise<Response> => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-length": "3" } }),
  };
  const voice = new VoiceService({
    store,
    modelsDir: tempDir(),
    publish: (e) => bus.publish(e),
    engines: {
      local: async (audio, opts) => (voiceFake.calls.push({ engine: "local", audio, opts }), "ローカルの文"),
      openai: async (audio, opts) => (voiceFake.calls.push({ engine: "openai", audio, opts }), "OpenAI の文"),
    },
    findTools: async () => voiceFake.tools,
    fetch: () => voiceFake.download(),
  });
  const app = createApp({ store, bus, token: TOKEN, providers, usage, serviceUsage, runner, approvals, uploads, voice, staticDir: opts.staticDir });
  const project = store.createProject({ name: "p", repo_path: tempDir(), provider: "claude" });

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
  return { app, store, bus, runner, project, call, provider, voiceFake, network, approvals, codexCalls: () => codexCalls };
}

const tick = () => new Promise((r) => setTimeout(r, 10));
export async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await tick();
  assert.ok(cond(), "条件を満たしませんでした");
}
