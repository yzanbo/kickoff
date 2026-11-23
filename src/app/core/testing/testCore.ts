// コアのテストの組み立て: 本物と同じ assembleCore を偽物（testEnv.ts）で通す createTestCore（API のテスト）と、
// 実行の受付（Runner）だけを組む setupCore（実行のテスト）。どちらもメモリの DB とプロジェクト 1 つ。テストからだけ使う
import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";
import type { ApprovalDecision } from "@shared/chat/approvalTypes";
import type { Project } from "@shared/projects/types";
import { systemClock } from "@/foundation/core/clock";
import { BrowserLogin } from "@/foundation/core/http/auth";
import { createKernel, type Kernel } from "@/foundation/core/kernel";
import type { HostPlatform } from "@/foundation/core/platform/types";
import { appOf, stopFeatures } from "@/foundation/core/serve";
import { afterTest } from "@/foundation/core/testing/afterTest";
import { callTool, toolNames } from "@/foundation/core/testing/toolCalls";
import type { McpToolHost } from "@/foundation/core/aiTools/host";
import type { ToolServer } from "@/foundation/core/aiTools/tool";
import type { Bus } from "@/foundation/core/bus";
import { tempDir } from "@/foundation/core/testing/tempDir";
import type { AgentProvider, GuardMaterials, ToolGateFactory } from "@/features/ai/core/providers/types";
import { ApprovalCenter } from "@/features/chat/core/approvals";
import { chatDeltaStage } from "@/features/chat/core/deltaStage";
import { createChatRunner, type RunnerDeps } from "@/features/chat/core/run/runner";
import { chatAttachmentsOf } from "@/features/attachments/core/index";
import { UploadStore } from "@/features/attachments/core/uploads";
import type { SecretCipher } from "@/features/database/core/secrets";
import { assembleCore } from "@/app/core/assemble";
import { toolGateFactory } from "@/features/guard/core/gate";
import { diagnosticToolGroup, guardTurnParts, type GuardTurnDeps } from "@/features/guard/core/index";
import { chatDetachPort } from "@/features/childChats/core/index";
import { compactTurnParts } from "@/features/compact/core/index";
import { providerHandoffPortOf, providerHandoffTurnParts, providerSwitchPort } from "@/features/providerSwitch/core/index";
import { MIGRATIONS } from "@/app/core/migrations";
import { ALL_SETTINGS } from "@/app/shared/settings";
import { offlineUsage, sameProvider, testEnv, testFakes, testPlatform, type TestEnvOptions, type TestFakes } from "./testEnv";
import { openTestStores, withFeatureStores, type TestStores } from "./testStore";

export { tick, until } from "@/foundation/core/testing/until";

/** API のテストの本体のトークン */
export const TOKEN = "t".repeat(32);
export const AUTH = { authorization: `Bearer ${TOKEN}` };

/**
 * 組み立てる前に、前回の起動で残ったデータを入れる（起動したときの再開の確かめを試す）。
 * そのあとは本物の起動と同じく、作業中のまま残ったチャットを中断にして再開の確かめに渡す
 */
export type BeforeStart = (store: TestStores, project: Project) => unknown;

/** メモリの DB（dbFile を渡せばそのファイル）の土台と、一時フォルダの中のプロジェクト（隣に作るワークツリーの <repo>-worktrees/ も、テストのあとに一緒に消える） */
function testKernel(dataDir: string, platform: HostPlatform, staticDir?: string, dbFile = ":memory:"): { k: Kernel; store: TestStores; project: Project } {
  const k = createKernel({ dataDir, port: 0, platform, staticDir, dbFile, migrations: MIGRATIONS, settings: ALL_SETTINGS });
  // 組み立てる前（前回のデータを入れる・実行だけのテスト）の店。土台の設定・秘密の値は Kernel のもの
  const store = openTestStores(k.db, (e) => k.bus.publish(e), { databaseId: k.paths.databaseId, settings: k.settings, secrets: k.secrets });
  const repo = path.join(tempDir(), "repo");
  fs.mkdirSync(repo);
  return { k, store, project: store.projects.create({ name: "p", repo_path: repo, provider: "claude" }) };
}

/**
 * 偽物で全部の機能を組み立てた API のアプリ（待ち受けない。見張りは ports だけ動かし、テストが終わったら機能を止める）。
 * 起動し直しを試すときは、同じ dbFile と fakes を渡してもう一度組み立てる（プロジェクトは組み立てるたびに 1 つ足す）
 */
export function createTestCore(opts: { staticDir?: string; beforeStart?: BeforeStart; dbFile?: string; fakes?: TestFakes } & Omit<TestEnvOptions, "secretCipher"> & { secretCipher?: SecretCipher } = {}) {
  const dataDir = tempDir();
  const fakes = opts.fakes ?? testFakes(dataDir);
  const { k, store, project } = testKernel(dataDir, testPlatform(fakes), opts.staticDir, opts.dbFile);
  opts.beforeStart?.(store, project);
  const assembled = assembleCore(k, testEnv(fakes, { secretCipher: opts.secretCipher, claudeSdk: opts.claudeSdk, provider: opts.provider, chat: opts.chat }));
  const browserLogin = new BrowserLogin();
  const { app, routes } = appOf(k, assembled, { token: TOKEN, browserLogin });
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
  const { trash, ai, uploads, userViews, devices, notifications, chat, docker, worktrees, github, terminals, ports, notes, databases, remoteImages } = assembled.apis;
  // 機能の口を、組み立てを分ける前と同じ名前で返す（API のテストを書き換えない）
  const { runner, approvals, streamingText, mcpTools, chatRemover, sessionsElsewhere } = chat;
  // 組み立てたあとの店は chat の束（記録を変えた知らせ logRevisions を実行と同じものにする）
  const parts = { store: withFeatureStores(chat.store, { databaseId: k.paths.databaseId, secrets: k.secrets }, (e) => k.bus.publish(e)), bus: k.bus, providers: ai.providers, runner, approvals, streamingText, mcpTools, chatRemover, sessionsElsewhere, uploads, userViews };
  const split = { docker, worktreeEnvs: worktrees.envs, worktreeFinisher: worktrees.aiFinish, prWatch: github.prWatch, terminals, ports, notes, databases, remoteImages };
  return { ...parts, ...split, ...fakes, k, app, routes, project, call, browserLogin, close, notifications, trashBin: trash, pairing: devices.pairing, codexCalls: () => fakes.counts.codex };
}

/**
 * Runner に渡す値のうち、ここで組み立てないもの（添付の置き場所・再開の時計など）と、本物と同じく登録する守りの contributor に渡すもの
 * （Bash の砂場・砂場の診断・門の作り方）
 */
type RunnerOptions = Omit<RunnerDeps, "store" | "approvals" | "providers" | "usage" | "bus"> &
  Partial<Pick<GuardTurnDeps, "bashSandbox" | "toolGate">> & { sandboxDiagnostics?: GuardTurnDeps["diagnostics"]; uploads?: UploadStore };

/** テストの添付の置き場（一時フォルダ。dir を渡せばそこ） */
export const testUploads = (dir = tempDir()) => new UploadStore(dir);

/** 偽のプロバイダー（どのプロバイダーとして呼ばれても同じもの）で、実行の受付だけを組み立てる */
export function setupCore<P extends AgentProvider>(provider: P, runnerOptions: RunnerOptions = {}, beforeStart?: (store: TestStores, project: Project) => number[]) {
  const { k, store, project } = testKernel(tempDir(), { appDataRoot: tempDir() } as HostPlatform);
  const { bus } = k;
  const deltas = chatDeltaStage(systemClock);
  bus.use(deltas);
  const approvals = new ApprovalCenter(bus);
  const providers = sameProvider(provider);
  const interrupted = beforeStart?.(store, project);
  // 足す口のない偽のプロバイダーで「いま」を送るテストを待たせない
  const usage = offlineUsage();
  // 守りの門は本物と同じく guard が作る（自分を守る守りはテストでは付けない）。門の材料は実行ごとに覚える（gateMaterials）
  const gateMaterials: GuardMaterials[] = [];
  const { bashSandbox, sandboxDiagnostics: diagnostics, toolGate: givenGate, contributors: given = [], aiTools: givenTools, uploads, ...rest } = runnerOptions;
  const factory = givenGate ?? toolGateFactory(undefined, []);
  const toolGate: ToolGateFactory = (m, cb, signal) => (gateMaterials.push(m), factory(m, cb, signal));
  // 本物の組み立てと同じく、守り・圧縮・AI の切り替えが実行に足すものと、砂場の診断のツールを登録する（ほかの上の機能はテストごとに contributors・aiTools で足す）
  const contributors = [
    guardTurnParts({ toolGate, bashSandbox, diagnostics, deleteGuard: rest.trashCommand !== undefined, providers }),
    compactTurnParts(store),
    providerHandoffTurnParts({ store, uploads }),
    ...given,
  ];
  // 添付の置き場を渡したら、本物と同じく送る文に添付のパスを書き添える口も作る
  const attachments = uploads ? chatAttachmentsOf(uploads) : undefined;
  const runner = createChatRunner({ store, approvals, providers, usage, bus, providerHandoff: providerHandoffPortOf(store), ...(interrupted ? { interrupted } : {}), ...(attachments ? { attachments } : {}), ...rest, contributors, aiTools: () => [diagnosticToolGroup, ...(givenTools?.() ?? [])] });
  // 子チャットを親から外す口と、AI の切り替えの準備（添付の置き場があるとき）も本物と同じく登録する
  const detach = chatDetachPort(store, (chatId) => runner.isBusy(chatId));
  runner.provide({ detach, ...(uploads ? { providerSwitch: providerSwitchPort(store, uploads) } : {}) });
  return { bus, deltas, store, approvals, providers, usage, runner, provider, project, gateMaterials, detach };
}

/** 実行の承認に返す答え（聞いたカードの入力から決める） */
type Decide = (input: Record<string, unknown>) => ApprovalDecision | Promise<ApprovalDecision>;

/** 見張っている口ごとの見張り（同じテストで 2 回呼んでも 1 つ） */
const watches = new WeakMap<object, ReturnType<typeof startWatch>>();

function startWatch(core: { bus: Bus; approvals: ApprovalCenter }, host: Pick<McpToolHost, "open">) {
  const open = vi.spyOn(host, "open");
  const asked: Record<string, unknown>[] = [];
  let decide: Decide = () => ({ action: "allow" });
  afterTest(
    core.bus.subscribe((event) => {
      if (event.type !== "approval") return;
      asked.push(event.approval.input);
      void Promise.resolve(decide(event.approval.input)).then((decision) => core.approvals.resolve(event.approval.id, decision));
    }),
  );
  const lastTools = (): ToolServer[] => open.mock.calls.at(-1)?.[0] ?? [];
  return {
    /** ツールが聞いたカードの入力（順に） */
    asked,
    /** これからの承認の答え（既定は許可） */
    answer: (fn: Decide) => void (decide = fn),
    /** 最後の実行に渡したツール */
    lastTools,
    names: (servers = lastTools()) => toolNames(servers),
    /** ツールを名前で呼ぶ（servers を省けば最後の実行のツール。失敗の結果は理由の文で投げる） */
    call: (name: string, args: Record<string, unknown> = {}, servers = lastTools()) => callTool(servers, name, args),
  };
}

/** 実行に渡した AI の操作ツールを覚えて名前で呼ぶ（host.open を見張る）。ツールが利用者に聞くカードには answer の答えを返す */
export function watchTools(core: { bus: Bus; approvals: ApprovalCenter }, host: Pick<McpToolHost, "open">) {
  const watch = watches.get(host) ?? startWatch(core, host);
  watches.set(host, watch);
  return watch;
}
