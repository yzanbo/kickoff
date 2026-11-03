// API のテスト（server.*.test.ts）の共通の準備: 偽のプロバイダーでアプリを組み立て、トークン付きで呼ぶ補助を返す。テストからだけ使う
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApprovalCenter } from "../approvals.js";
import { Bus } from "../bus.js";
import type { AgentProvider, ProviderRunResult } from "../providers/types.js";
import { Runner } from "../runner.js";
import { createApp } from "../server.js";
import { Store } from "../store.js";
import type { ProviderId, SlashCommandOption } from "../types.js";
import { UploadStore } from "../uploads.js";
import { ServiceUsageMonitor } from "../serviceUsage/index.js";
import type { UsageMonitor } from "../usage.js";
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
  /** これがあれば、外から release するまで作業中のままにする（止められたら cancelled） */
  private gate: Promise<void> | null = null;
  async run(params: { cwd: string; prompt: string; resumeSessionId: string | null }, _cb: unknown, signal: AbortSignal): Promise<ProviderRunResult> {
    this.lastCwd = params.cwd;
    this.prompts.push(params.prompt);
    this.resumes.push(params.resumeSessionId);
    if (this.gate) {
      const aborted = new Promise<"aborted">((resolve) => signal.addEventListener("abort", () => resolve("aborted"), { once: true }));
      if ((await Promise.race([this.gate, aborted])) === "aborted") return { status: "cancelled", sessionId: "s1" };
    }
    return { status: "completed", sessionId: "s1", result: "ok", turns: 1, lastMessageId: `m${this.prompts.length}` };
  }
  /** 分岐したときの引数（会話・位置・作業フォルダ） */
  forks: [string, string, string][] = [];
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

export function setup() {
  const bus = new Bus();
  const store = new Store(":memory:", (e) => bus.publish(e));
  const approvals = new ApprovalCenter(bus);
  const uploads = new UploadStore(tempDir());
  const usage = { get: async () => ({ available: false }), refresh: async () => ({ available: false }) } as unknown as UsageMonitor;
  const provider = new FakeProvider();
  const providers = { claude: provider, codex: provider, gemini: provider } as Record<ProviderId, AgentProvider>;
  const runner = new Runner({ store, approvals, providers, usage, uploads, bus });
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
  const app = createApp({ store, bus, token: TOKEN, providers, usage, serviceUsage, runner, approvals, uploads });
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
  return { app, store, runner, project, call, provider, codexCalls: () => codexCalls };
}

const tick = () => new Promise((r) => setTimeout(r, 10));
export async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await tick();
  assert.ok(cond(), "条件を満たしませんでした");
}
