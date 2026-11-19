// コアのテストの共通の準備: メモリの DB・変更の知らせ・承認・実行の受付（Runner）と、プロジェクト 1 つ。
// API のテスト（testServer.ts）と実行のテスト（chat/runner.test.ts）で使う。テストからだけ使う
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PROVIDER_IDS, type Project, type ProviderId } from "@shared/types";
import { Bus } from "@/foundation/core/bus";
import { ApprovalCenter } from "@/features/chat/core/approvals";
import { Runner } from "@/features/chat/core/runner";
import { Store } from "@/foundation/core/db/store";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import type { UsageMonitor } from "@/features/ai/core/usage/planUsage";
import { tempDir } from "@/foundation/core/testing/tempDir";

/** Runner に渡す値のうち、ここで組み立てないもの（添付の置き場所・再開の時計など） */
type RunnerOptions = Omit<ConstructorParameters<typeof Runner>[0], "store" | "approvals" | "providers" | "usage" | "bus">;

/** 使用枠は取れない（ネットワークに出ない）。超過分の知らせだけは本物と同じく覚え、動き始めたかを返す */
function offlineUsage(): UsageMonitor {
  let inUse = false;
  const noteOverage = (next: boolean) => {
    const started = next && !inUse;
    inUse = next;
    return started;
  };
  return { get: async () => ({ available: false }), refresh: async () => ({ available: false }), noteOverage } as unknown as UsageMonitor;
}

/**
 * Runner を作る前に、前回の起動で残ったデータを入れる（起動したときの再開の確かめを試す）。
 * 返した ID を、起動のときの startCore と同じく作業の途中で止まったチャットとして Runner の interrupted に渡す
 */
export type BeforeStart = (store: Store, project: Project) => number[];

/** 偽のプロバイダー（どのプロバイダーとして呼ばれても同じもの）で、コアの中身を組み立てる */
export function setupCore<P extends AgentProvider>(provider: P, runnerOptions: RunnerOptions = {}, beforeStart?: BeforeStart) {
  const bus = new Bus();
  const store = new Store(":memory:", (e) => bus.publish(e));
  const approvals = new ApprovalCenter(bus);
  const providers = Object.fromEntries(PROVIDER_IDS.map((id) => [id, provider])) as unknown as Record<ProviderId, AgentProvider>;
  // プロジェクトのフォルダは一時フォルダの中に作る（隣に作るワークツリーの <repo>-worktrees/ も、テストのあとに一緒に消える）
  const repo = path.join(tempDir(), "repo");
  fs.mkdirSync(repo);
  const project = store.projects.create({ name: "p", repo_path: repo, provider: "claude" });
  const interrupted = beforeStart?.(store, project);
  // 足す口のない偽のプロバイダーで「いま」を送るテストを待たせない
  const usage = offlineUsage();
  const runner = new Runner({ store, approvals, providers, usage, bus, tellableWaitMs: 50, ...(interrupted ? { interrupted } : {}), ...runnerOptions });
  return { bus, store, approvals, providers, usage, runner, provider, project };
}

/** 少し待つ（ほかの非同期の処理を進める） */
export const tick = () => new Promise((r) => setTimeout(r, 10));

/** cond が満たされるまで待つ（既定 2 秒で失敗。別のプロセスの起動を待つなど、負荷で遅れうるものは ms を長くする） */
export async function until(cond: () => boolean, ms = 2000) {
  for (let i = 0; i < ms / 10 && !cond(); i++) await tick();
  assert.ok(cond(), "条件を満たしませんでした");
}
