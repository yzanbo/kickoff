import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";
import { trashProject } from "./trash";

test("プロジェクトをゴミ箱へ: 中のチャットを入れる途中で失敗したら、ゴミ箱の行も残さず、プロジェクトも隠さない", () => {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  const trashBin = { addRecord: (item: Parameters<typeof store.trash.add>[0]) => store.trash.add(item) };
  const deps = { db: store.db, projects: store.projects, trashed: () => assert.fail("中のチャットを入れられない") };
  const at = "2026-11-20T00:00:00.000Z";
  assert.throws(() => trashProject({ ...deps, trashBin: { addRecord: (item) => trashBin.addRecord({ ...item, id: "t1", trashed_at: at }) } }, project, at));
  assert.equal(store.trash.get("t1"), null);
  assert.ok(store.projects.get(project.id));
  // 失敗しなければ、行を足して隠す
  const item = trashProject({ ...deps, trashed: () => {}, trashBin: { addRecord: (i) => trashBin.addRecord({ ...i, id: "t2", trashed_at: at }) } }, project, at);
  assert.equal(store.trash.get(item.id)?.kind, "project");
  assert.equal(store.projects.get(project.id), undefined);
});
