import assert from "node:assert/strict";
import { test } from "node:test";
import { Store } from "../db/store.js";
import { chatContextNote, chatContextOf } from "./chatContext.js";
import { HANDOFF_CONTEXT_RULE } from "@shared/chat/handoff";

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

test("親も子もないチャット: 名前と ID だけで、系譜・聞いた位置・子はない", () => {
  const { store, chat } = setup();
  const root = chat("メイン");
  assert.deepEqual(chatContextOf(store, root), { id: root.id, title: "メイン", ancestors: [], askedFrom: null, children: [], moreChildren: 0 });
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

test("添える文: 親も子もないチャットは null、子チャットは自分と親の名前・ID・セッション ID と系譜・聞いた位置", () => {
  assert.equal(chatContextNote({ id: 7, title: "", ancestors: [], askedFrom: null, children: [], moreChildren: 0 }), null);
  const note = chatContextNote({
    id: 9,
    title: "",
    ancestors: [
      { id: 1, title: "メイン", sessionId: null },
      { id: 4, title: "子", sessionId: "s-4" },
    ],
    askedFrom: "設計はこうします",
    children: [],
    moreChildren: 0,
  })!;
  // 孫は孫チャットと呼び、親も子チャットだと添える（子と孫を見分ける）
  assert.ok(note.includes("- このチャット: 「（名前なし）」（Kickoff のチャット ID: 9）。親チャットから寄り道の質問をするために作った孫チャットです。"));
  assert.ok(note.includes("- 親チャット: 「子」（Kickoff のチャット ID: 4、Claude Code のセッション ID: s-4。親チャットも子チャットです）"));
  assert.ok(note.includes("「メイン」（ID: 1） › 「子」（ID: 4） › このチャット"));
  assert.ok(note.includes("この発言から聞きました: 「設計はこうします」"));
  // 親だけなら系譜の行は出さない
  const child = chatContextNote({ id: 9, title: "x", ancestors: [{ id: 4, title: "子", sessionId: null }], askedFrom: null, children: [], moreChildren: 0 })!;
  assert.ok(!child.includes("系譜"));
  assert.ok(child.includes("作った子チャットです。"));
  // 親に渡す依頼文を頼まれたら、依頼文の全文だけを書く（利用者が自分の言葉で頼み直しても同じ形に）
  assert.ok(child.includes(`- ${HANDOFF_CONTEXT_RULE}`));
});

test("子のあるチャット: 子孫を作った順に、子のすぐ下にその子を並べ、聞いた位置・状態・アーカイブを持つ", () => {
  const { store, chat } = setup();
  const root = chat("メイン");
  const asked = store.events.add(root.id, { type: "user", text: "ここを\n調べて", message_uuid: "u1" });
  const first = chat("子1", { id: root.id, eventId: asked.id });
  store.chats.update(first.id, { session_id: "s-1", status: "running" });
  const second = chat("子2", { id: root.id });
  store.chats.archive(second.id, true);
  const grandchild = chat("孫", { id: first.id });
  const context = chatContextOf(store, root);
  assert.deepEqual(
    context.children.map((c) => [c.id, c.depth, c.parentId, c.sessionId, c.status, c.archived]),
    [
      [first.id, 1, root.id, "s-1", "running", false],
      [grandchild.id, 2, first.id, null, "completed", false],
      [second.id, 1, root.id, null, "completed", true],
    ],
  );
  assert.equal(context.children[0].askedFrom, "ここを 調べて");
  assert.equal(context.moreChildren, 0);
  // 子チャットから見ると、自分の子だけ（親・兄弟は入らない）
  assert.deepEqual(chatContextOf(store, first).children.map((c) => c.id), [grandchild.id]);
});

test("子孫が多いときは上限まで載せ、残りの数を持つ", () => {
  const { store, chat } = setup();
  const root = chat("メイン");
  for (let i = 0; i < 32; i++) chat(`子${i}`, { id: root.id });
  const context = chatContextOf(store, root);
  assert.equal(context.children.length, 30);
  assert.equal(context.moreChildren, 2);
});

test("添える文: 親のないチャットでも子があれば、子・孫を名前・ID・セッション ID・状態・聞いた位置で並べる", () => {
  const note = chatContextNote({
    id: 1,
    title: "メイン",
    ancestors: [],
    askedFrom: null,
    children: [
      { id: 4, title: "子", sessionId: "s-4", depth: 1, parentId: 1, status: "completed", archived: false, askedFrom: "ここを調べて" },
      { id: 6, title: "", sessionId: null, depth: 2, parentId: 4, status: "running", archived: true, askedFrom: null },
    ],
    moreChildren: 3,
  })!;
  assert.ok(note.includes("- このチャット: 「メイン」（Kickoff のチャット ID: 1）。親のないチャットです。"));
  assert.ok(!note.includes("親チャット: "));
  assert.ok(note.includes("  - 子チャット「子」（Kickoff のチャット ID: 4、Claude Code のセッション ID: s-4、状態: 終わった。このチャットの会話のこの発言から聞いた: 「ここを調べて」）"));
  assert.ok(note.includes("    - 孫チャット「（名前なし）」（Kickoff のチャット ID: 6、状態: 作業中・アーカイブ済み）"));
  assert.ok(note.includes("ほか 3 件"));
  // 子チャットに子があれば、親の行と子の一覧の両方。深さは根から数える（子の子は孫チャット）
  const middle = chatContextNote({
    id: 4,
    title: "子",
    ancestors: [{ id: 1, title: "メイン", sessionId: null }],
    askedFrom: null,
    children: [{ id: 6, title: "孫", sessionId: null, depth: 1, parentId: 4, status: "completed", archived: false, askedFrom: null }],
    moreChildren: 0,
  })!;
  assert.ok(middle.includes("- 親チャット: 「メイン」"));
  assert.ok(middle.includes("  - 孫チャット「孫」（Kickoff のチャット ID: 6、状態: 終わった）"));
});
