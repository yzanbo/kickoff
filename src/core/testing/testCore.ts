// コアのテストの共通の準備: メモリの DB・変更の知らせ・承認・実行の受付（Runner）と、プロジェクト 1 つ。
// API のテスト（testServer.ts）と実行のテスト（chat/runner.test.ts）で使う。テストからだけ使う
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { ProviderId } from "@shared/types";
import { Bus } from "../bus.js";
import { ApprovalCenter } from "../chat/approvals.js";
import { Runner } from "../chat/runner.js";
import { Store } from "../db/store.js";
import type { AgentProvider } from "../providers/types.js";
import type { UsageMonitor } from "../usage/planUsage.js";
import { tempDir } from "./tempDir.js";

/** Runner に渡す値のうち、ここで組み立てないもの（添付の置き場所・再開の時計など） */
type RunnerOptions = Omit<ConstructorParameters<typeof Runner>[0], "store" | "approvals" | "providers" | "usage" | "bus">;

/** 使用枠は取れない（ネットワークに出ない） */
const offlineUsage = { get: async () => ({ available: false }), refresh: async () => ({ available: false }) } as unknown as UsageMonitor;

/** 偽のプロバイダー（どのプロバイダーとして呼ばれても同じもの）で、コアの中身を組み立てる */
export function setupCore<P extends AgentProvider>(provider: P, runnerOptions: RunnerOptions = {}) {
  const bus = new Bus();
  const store = new Store(":memory:", (e) => bus.publish(e));
  const approvals = new ApprovalCenter(bus);
  const providers = { claude: provider, codex: provider, gemini: provider } as Record<ProviderId, AgentProvider>;
  // 足す口のない偽のプロバイダーで「いま」を送るテストを待たせない
  const runner = new Runner({ store, approvals, providers, usage: offlineUsage, bus, tellableWaitMs: 50, ...runnerOptions });
  // プロジェクトのフォルダは一時フォルダの中に作る（隣に作るワークツリーの <repo>-worktrees/ も、テストのあとに一緒に消える）
  const repo = path.join(tempDir(), "repo");
  fs.mkdirSync(repo);
  const project = store.projects.create({ name: "p", repo_path: repo, provider: "claude" });
  return { bus, store, approvals, providers, usage: offlineUsage, runner, provider, project };
}

/** 少し待つ（ほかの非同期の処理を進める） */
export const tick = () => new Promise((r) => setTimeout(r, 10));

/** cond が満たされるまで待つ（2 秒で失敗） */
export async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await tick();
  assert.ok(cond(), "条件を満たしませんでした");
}
