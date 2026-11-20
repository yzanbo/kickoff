import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";

test("ゴミ箱の店: 消したチャットの名前は登録した口で引き、もうないチャットは消したチャットも null（前の FK の ON DELETE SET NULL と同じ見え方）", () => {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, title: "掃除", provider: "claude", status: "completed" });
  const add = (id: string) => store.trash.add({ id, project_id: project.id, kind: "file", label: id, by_chat_id: chat.id, trashed_at: "2026-11-20T00:00:00.000Z" });
  // 登録するまでは名前が分からない（消したチャットの番号はそのまま）
  assert.deepEqual([add("a").by_chat_id, store.trash.get("a")?.by_chat_title], [chat.id, null]);
  store.trash.useChatTitles((ids) => new Map(store.chats.list({ includeArchived: true }).filter((c) => ids.includes(c.id)).map((c) => [c.id, c.title])));
  assert.deepEqual([store.trash.get("a")?.by_chat_id, store.trash.get("a")?.by_chat_title], [chat.id, "掃除"]);
  store.db.prepare("DELETE FROM chats WHERE id = ?").run(chat.id);
  assert.deepEqual(
    store.trash.list(project.id).map((i) => [i.by_chat_id, i.by_chat_title]),
    [[null, null]],
  );
  // 覚え書きの種類ごとの中身は JSON のまま読み書きする
  store.trash.setDetails("a", { note: "x.md", companions: ["/tmp/p/y"] });
  assert.deepEqual(store.trash.get("a")?.details, { note: "x.md", companions: ["/tmp/p/y"] });
});
