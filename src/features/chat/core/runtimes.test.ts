import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";
import { addLater, newMessage } from "@shared/chat/outbox";
import { ChatRuntimes } from "./runtimes";

const env = { now: "2026-11-22T00:00:00.000Z", newId: () => "q2" };

test("作業中の状態を作り直すと、保存した出す箱を読み戻す（ゴミ箱から戻したチャットの送信待ちを空に見せず、変えても前の指示を失わない）", () => {
  const store = testStore(":memory:");
  const project = store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "A", status: "completed", model: null });
  const runtimes = new ChatRuntimes({ store, onEditingChanged: () => {} });
  runtimes.get(chat.id).setOutbox(addLater(runtimes.get(chat.id).outbox, { ...newMessage(env, "次", {}, []), id: "q1" }));
  // ゴミ箱へ入れた（作業中の状態を捨てる）→ 戻した
  runtimes.forget(chat.id);
  const restored = runtimes.get(chat.id);
  assert.deepEqual(restored.outbox.later.map((m) => m.text), ["次"]);
  restored.setOutbox(addLater(restored.outbox, newMessage(env, "その次", {}, [])));
  assert.deepEqual(store.outbox.list()[0].box.later.map((m) => m.text), ["次", "その次"]);
});
