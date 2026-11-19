// コアのテストの組み立て: 本物と同じ assembleCore を偽物（testEnv.ts）で通す createTestCore（API のテスト）と、
// 実行の受付（Runner）だけを組む setupCore（実行のテスト）。どちらもメモリの DB とプロジェクト 1 つ。テストからだけ使う
import fs from "node:fs";
import path from "node:path";
import type { Project } from "@shared/types";
import { systemClock } from "@/foundation/core/clock";
import type { Store } from "@/foundation/core/db/store";
import { BrowserLogin } from "@/foundation/core/http/auth";
import { createKernel, type KernelWithStore } from "@/foundation/core/kernel";
import type { HostPlatform } from "@/foundation/core/platform/types";
import { appOf, stopFeatures } from "@/foundation/core/serve";
import { afterTest } from "@/foundation/core/testing/afterTest";
import type { FakeClaudeSdk } from "@/foundation/core/testing/fakeClaudeSdk";
import { tempDir } from "@/foundation/core/testing/tempDir";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import { ApprovalCenter } from "@/features/chat/core/approvals";
import { chatDeltaStage } from "@/features/chat/core/deltaStage";
import { Runner } from "@/features/chat/core/runner";
import type { SecretCipher } from "@/features/database/core/secrets";
import { assembleCore } from "@/app/core/assemble";
import { offlineUsage, sameProvider, testEnv, testFakes, testPlatform } from "./testEnv";

export { tick, until } from "@/foundation/core/testing/until";

/** API のテストの本体のトークン */
export const TOKEN = "t".repeat(32);
export const AUTH = { authorization: `Bearer ${TOKEN}` };

/**
 * 組み立てる前に、前回の起動で残ったデータを入れる（起動したときの再開の確かめを試す）。
 * そのあとは本物の起動と同じく、作業中のまま残ったチャットを中断にして再開の確かめに渡す
 */
export type BeforeStart = (store: Store, project: Project) => unknown;

/** メモリの DB の土台と、一時フォルダの中のプロジェクト（隣に作るワークツリーの <repo>-worktrees/ も、テストのあとに一緒に消える） */
function testKernel(dataDir: string, platform: HostPlatform, staticDir?: string): { k: KernelWithStore; project: Project } {
  const k = createKernel({ dataDir, port: 0, platform, staticDir, dbFile: ":memory:" });
  const repo = path.join(tempDir(), "repo");
  fs.mkdirSync(repo);
  return { k, project: k.store.projects.create({ name: "p", repo_path: repo, provider: "claude" }) };
}

/** 偽物で全部の機能を組み立てた API のアプリ（待ち受けない。見張りは ports だけ動かし、テストが終わったら機能を止める） */
export function createTestCore(opts: { staticDir?: string; secretCipher?: SecretCipher; beforeStart?: BeforeStart; claudeSdk?: FakeClaudeSdk } = {}) {
  const dataDir = tempDir();
  const fakes = testFakes(dataDir);
  const { k, project } = testKernel(dataDir, testPlatform(fakes), opts.staticDir);
  opts.beforeStart?.(k.store, project);
  const assembled = assembleCore(k, testEnv(fakes, { secretCipher: opts.secretCipher, claudeSdk: opts.claudeSdk }));
  const browserLogin = new BrowserLogin();
  const app = appOf(k, assembled, { token: TOKEN, browserLogin });
  const close = () => stopFeatures(k, assembled.features);
  afterTest(close);
  // 見張りのうちポートを使っているプロセスだけは始める（実行が終わったときの見張りを確かめる。ほかは start しない）
  assembled.apis.ports.start();
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
  const { trash, ai, uploads, userViews, devices, chat, docker, worktrees, github, terminals, ports, notes, databases, remoteImages } = assembled.apis;
  // 機能の口を、組み立てを分ける前と同じ名前で返す（API のテストを書き換えない）
  const { runner, approvals, streamingText, mcpTools, chatRemover, sessionsElsewhere } = chat;
  const parts = { store: k.store, bus: k.bus, providers: ai.providers, runner, approvals, streamingText, mcpTools, chatRemover, sessionsElsewhere, uploads, userViews };
  const split = { docker, worktreeEnvs: worktrees.envs, worktreeFinisher: worktrees.finisher, prWatch: github.prWatch, terminals, ports, notes, databases, remoteImages };
  return { ...parts, ...split, ...fakes, k, app, project, call, browserLogin, close, trashBin: trash, pairing: devices.pairing, codexCalls: () => fakes.counts.codex };
}

/** Runner に渡す値のうち、ここで組み立てないもの（添付の置き場所・再開の時計など） */
type RunnerOptions = Omit<ConstructorParameters<typeof Runner>[0], "store" | "approvals" | "providers" | "usage" | "bus">;

/** 偽のプロバイダー（どのプロバイダーとして呼ばれても同じもの）で、実行の受付だけを組み立てる */
export function setupCore<P extends AgentProvider>(provider: P, runnerOptions: RunnerOptions = {}, beforeStart?: (store: Store, project: Project) => number[]) {
  const { k, project } = testKernel(tempDir(), { appDataRoot: tempDir() } as HostPlatform);
  const { bus, store } = k;
  const deltas = chatDeltaStage(systemClock);
  bus.use(deltas);
  const approvals = new ApprovalCenter(bus);
  const providers = sameProvider(provider);
  const interrupted = beforeStart?.(store, project);
  // 足す口のない偽のプロバイダーで「いま」を送るテストを待たせない
  const usage = offlineUsage();
  const runner = new Runner({ store, approvals, providers, usage, bus, tellableWaitMs: 50, ...(interrupted ? { interrupted } : {}), ...runnerOptions });
  return { bus, deltas, store, approvals, providers, usage, runner, provider, project };
}
