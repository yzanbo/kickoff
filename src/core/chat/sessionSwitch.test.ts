import assert from "node:assert/strict";
import { test } from "node:test";
import { Store } from "../db/store.js";
import type { AgentProvider } from "../providers/types.js";
import { switchAfterCompact } from "./sessionSwitch.js";

function setup() {
  const store = new Store(":memory:", () => {});
  const project = store.projects.create({ name: "p", repo_path: "/work/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, title: "長い", provider: "claude", status: "completed" });
  store.chats.update(chat.id, { session_id: "old" });
  const trimmed: string[] = [];
  const provider = {
    trimSession: async (sessionId: string) => (trimmed.push(sessionId), { sessionId: "new", previousFile: "/claude/old.jsonl" }),
  } as unknown as AgentProvider;
  const trashed: { sessionId: string; file: string; label: string }[] = [];
  const trash = async (sessionId: string, file: string, ctx: { label: string }) => void trashed.push({ sessionId, file, label: ctx.label });
  return { store, chat, provider, trimmed, trashed, trash };
}

test("乗り換え: 圧縮した作業のあとだけ、新しいセッションに乗り換え、記録の起点を付け替えて、古い記録をゴミ箱へ入れる", async () => {
  const { store, chat, provider, trimmed, trashed, trash } = setup();
  const since = store.events.add(chat.id, { type: "result", status: "completed", text: "前", session_id: "old", message_id: "m1" }).id;
  // 圧縮していない作業では何もしない
  assert.equal(await switchAfterCompact({ store, provider, trash }, chat.id, "/work/p", since), null);
  assert.equal(trimmed.length, 0);

  store.events.add(chat.id, { type: "compact", trigger: "auto", pre_tokens: 1000 });
  store.events.add(chat.id, { type: "result", status: "completed", text: "後", session_id: "old", message_id: "m2" });
  assert.equal(await switchAfterCompact({ store, provider, trash }, chat.id, "/work/p", since), "new");
  assert.equal(store.chats.get(chat.id)?.session_id, "new");
  const results = store.events.list(chat.id).filter((e) => e.type === "result");
  assert.deepEqual(
    results.map((e) => (e.type === "result" ? e.data.session_id : null)),
    ["new", "new"],
  );
  assert.deepEqual(trashed, [{ sessionId: "old", file: "/claude/old.jsonl", label: "会話記録（「長い」の圧縮より前）" }]);
});

test("乗り換え: ほかのチャット（分岐したものなど）が元の記録を指していれば、古い記録は残す", async () => {
  const { store, chat, provider, trashed, trash } = setup();
  const other = store.chats.create({ project_id: chat.project_id, title: "分岐", provider: "claude", status: "completed" });
  store.events.add(other.id, { type: "result", status: "completed", text: "写し", session_id: "old", message_id: "m0" });
  store.events.add(chat.id, { type: "compact", trigger: "manual", pre_tokens: 1000 });
  assert.equal(await switchAfterCompact({ store, provider, trash }, chat.id, "/work/p", 0), "new");
  assert.equal(trashed.length, 0);
});
