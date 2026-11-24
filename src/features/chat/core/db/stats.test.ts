import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";
import { databaseStats } from "./stats";

test("診断の集計: チャットと記録の数、記録の多いチャット（多い順）。メモリの DB ならファイルの大きさは 0", () => {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  const chat = (title: string) => store.chats.create({ project_id: project.id, provider: "claude", title, status: "completed", model: null });
  const quiet = chat("静か");
  const busy = chat("長い");
  store.events.add(quiet.id, { type: "notice", message: "a" });
  for (const message of ["a", "b", "c"]) store.events.add(busy.id, { type: "notice", message });
  assert.deepEqual(databaseStats(store.db, store.db.location()), {
    dbMB: 0,
    walMB: 0,
    chats: 2,
    events: 4,
    busiestChats: [
      { id: busy.id, events: 3, title: "長い", status: "completed" },
      { id: quiet.id, events: 1, title: "静か", status: "completed" },
    ],
  });
});
