import assert from "node:assert/strict";
import { test } from "node:test";
import { Store } from "../db/store.js";
import { chatContextNote, chatContextOf } from "./chatContext.js";

function setup() {
  const store = new Store(":memory:");
  const project = store.projects.create({ name: "a", repo_path: "/tmp/a", provider: "claude" });
  const chat = (title: string, parent: { id: number; eventId?: number } | null = null) =>
    store.chats.create({
      project_id: project.id,
      provider: "claude",
      title,
      status: "completed",
      parent_chat_id: parent?.id ?? null,
      parent_event_id: parent?.eventId ?? null,
    });
  return { store, chat };
}

test("親のないチャット: 名前と ID だけで、系譜と聞いた位置はない", () => {
  const { store, chat } = setup();
  const root = chat("メイン");
  assert.deepEqual(chatContextOf(store, root), { id: root.id, title: "メイン", ancestors: [], askedFrom: null });
});

test("孫チャット: 系譜は根 → 親の順で、セッション ID と、親の会話で聞いた発言の書き出しを持つ", () => {
  const { store, chat } = setup();
  const root = chat("メイン");
  store.chats.update(root.id, { session_id: "s-root" });
  const child = chat("子", { id: root.id });
  const asked = store.events.add(child.id, { type: "text", text: "設計は\n  こうします" });
  const grandchild = chat("孫", { id: child.id, eventId: asked.id });
  const context = chatContextOf(store, grandchild);
  assert.deepEqual(
    context.ancestors.map((a) => [a.id, a.title, a.sessionId]),
    [
      [root.id, "メイン", "s-root"],
      [child.id, "子", null],
    ],
  );
  assert.equal(context.askedFrom, "設計は こうします");
});

test("聞いた位置: 親のものでない記録・長い文は使わない / 詰める", () => {
  const { store, chat } = setup();
  const parent = chat("親");
  const other = chat("ほか");
  const foreign = store.events.add(other.id, { type: "user", text: "ほかの発言", message_uuid: "u1" });
  assert.equal(chatContextOf(store, chat("子", { id: parent.id, eventId: foreign.id })).askedFrom, null);
  const long = store.events.add(parent.id, { type: "user", text: "あ".repeat(300), message_uuid: "u2" });
  const excerpt = chatContextOf(store, chat("子2", { id: parent.id, eventId: long.id })).askedFrom;
  assert.equal(excerpt, `${"あ".repeat(160)}…`);
});

test("添える文: 親のないチャットは null、子チャットは自分と親の名前・ID・セッション ID と系譜・聞いた位置", () => {
  assert.equal(chatContextNote({ id: 7, title: "", ancestors: [], askedFrom: null }), null);
  const note = chatContextNote({
    id: 9,
    title: "",
    ancestors: [
      { id: 1, title: "メイン", sessionId: null },
      { id: 4, title: "子", sessionId: "s-4" },
    ],
    askedFrom: "設計はこうします",
  })!;
  assert.ok(note.includes("- このチャット: 「（名前なし）」（Kickoff のチャット ID: 9）"));
  assert.ok(note.includes("- 親チャット: 「子」（Kickoff のチャット ID: 4、Claude Code のセッション ID: s-4）"));
  assert.ok(note.includes("「メイン」（ID: 1） › 「子」（ID: 4） › このチャット"));
  assert.ok(note.includes("この発言から聞きました: 「設計はこうします」"));
  // 親だけなら系譜の行は出さない
  assert.ok(!chatContextNote({ id: 9, title: "x", ancestors: [{ id: 4, title: "子", sessionId: null }], askedFrom: null })!.includes("系譜"));
});
