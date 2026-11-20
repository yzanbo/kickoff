import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";
import type { StoredWorktreeEnv } from "./worktreeEnvs";

const env = (path: string, projectId: number, band: number | null): StoredWorktreeEnv => ({ path, project_id: projectId, band, host: null, slots: [], compose_names: [], rewritten: [], issues: [], blocked: null });

test("ワークツリーの表: 色と実行環境は同じ行に持ち、実行環境を消しても色は残す（色のない行は消す）", () => {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  // 色を覚えてから実行環境を作る・消す
  assert.equal(store.worktreeColors.remember(project.id, "/tmp/p-wt/a", 30), 30);
  store.worktreeEnvs.put(env("/tmp/p-wt/a", project.id, 201));
  assert.equal(store.worktreeEnvs.get("/tmp/p-wt/a")?.band, 201);
  assert.deepEqual([...store.worktreeEnvs.takenBands()], [201]);
  store.worktreeEnvs.remove("/tmp/p-wt/a");
  assert.equal(store.worktreeEnvs.get("/tmp/p-wt/a"), undefined);
  assert.deepEqual([...store.worktreeEnvs.takenBands()], []);
  assert.deepEqual([...store.worktreeColors.of(project.id)], [["/tmp/p-wt/a", 30]]);
  // 実行環境だけの行に色を足すと、先に覚えた色にそろう。色のない行は実行環境を消すと消える
  store.worktreeEnvs.put(env("/tmp/p-wt/b", project.id, 202));
  assert.equal(store.worktreeColors.of(project.id).has("/tmp/p-wt/b"), false);
  assert.equal(store.worktreeColors.remember(project.id, "/tmp/p-wt/b", 60), 60);
  assert.equal(store.worktreeColors.remember(project.id, "/tmp/p-wt/b", 90), 60);
  store.worktreeEnvs.put(env("/tmp/p-wt/c", project.id, null));
  store.worktreeEnvs.remove("/tmp/p-wt/c");
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM worktrees WHERE path = '/tmp/p-wt/c'").get()?.n, 0);
  assert.deepEqual(store.worktreeEnvs.list(project.id).map((e) => e.path), ["/tmp/p-wt/b"]);
  // 色は 0〜359
  assert.throws(() => store.worktreeColors.remember(project.id, "/tmp/p-wt/d", 360), /CHECK/);
});
