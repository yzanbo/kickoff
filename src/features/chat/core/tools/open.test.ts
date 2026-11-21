// チャットの AI が家系のチャットを開く・下書きを入れるツールの中身（家系の範囲・画面への頼み）
import assert from "node:assert/strict";
import { test } from "vitest";
import type { BusEvent } from "@shared/foundation/contract";
import { testStore } from "@/app/core/testing/testStore";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { callDef } from "@/foundation/core/testing/toolCalls";
import { chatOpenTools } from "./open";

/** 店に、根 ─ 子 ─ 孫 と、別の家系の「よそ」を用意する（ノート・ファイル・差分・SQL を開くツールは notes・files・git・database のテスト） */
function setup() {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: tempDir(), provider: "claude" });
  const ctx = { store, project };
  const base = { project_id: project.id, provider: "claude" as const, status: "completed" as const, model: null, effort: null, permission_mode: "default" as const, fast_mode: false, group_id: null, worktree_path: null, parent_event_id: null, note_path: null };
  const root = store.chats.create({ ...base, title: "根", parent_chat_id: null });
  const child = store.chats.create({ ...base, title: "子", parent_chat_id: root.id });
  const grandchild = store.chats.create({ ...base, title: "孫", parent_chat_id: child.id });
  const other = store.chats.create({ ...base, title: "よそ", parent_chat_id: null });
  const published: BusEvent[] = [];
  const familyOf = (chatId: number) => {
    const { openChat, addDraft } = chatOpenTools({ store, publish: (e) => published.push(e) }, chatId);
    return { openChat: (args: Record<string, unknown>) => callDef(openChat, args), addDraft: (args: Record<string, unknown>) => callDef(addDraft, args) };
  };
  return { ctx, root, child, grandchild, other, published, familyOf };
}

test("open_chat: 家系のチャットは開くよう頼み（親チャットはチャットのパネル）、家系の外は断る", async () => {
  const { root, child, grandchild, other, published, familyOf } = setup();
  const tools = familyOf(child.id);
  assert.match(await tools.openChat({ chat_id: grandchild.id, place: "side" }), /右の欄/);
  const e = published[0];
  assert.ok(e.type === "open_view" && e.request.kind === "chat");
  assert.equal(e.request.place, "side");
  assert.deepEqual(
    e.request.lineage.map((c) => c.id),
    [root.id, child.id, grandchild.id],
  );
  assert.match(await tools.openChat({ chat_id: root.id, place: "window" }), /チャットのパネル/);
  await assert.rejects(tools.openChat({ chat_id: other.id }), /家系（.*）にありません/);
  assert.equal(published.length, 2);
});

test("add_draft: 家系のチャットに頼み、親チャットに入れるときだけ「子チャットから」の印。家系の外・アーカイブ済み・空は断る", async () => {
  const { ctx, root, child, grandchild, other, published, familyOf } = setup();
  const tools = familyOf(child.id);
  assert.match(await tools.addDraft({ chat_id: root.id, text: " 調べた結果です " }), /チャット「根」（ID \d+・親）の入力欄に下書き/);
  const e = published[0];
  assert.ok(e.type === "chat_draft");
  assert.deepEqual([e.request.text, e.request.from, e.request.lineage.map((c) => c.id)], ["調べた結果です", { chat_id: child.id, title: "子" }, [root.id]]);
  await tools.addDraft({ chat_id: grandchild.id, text: "続けて" });
  assert.ok(published[1].type === "chat_draft" && published[1].request.from === null);
  await assert.rejects(tools.addDraft({ chat_id: other.id, text: "a" }), /家系（.*）にありません/);
  await assert.rejects(tools.addDraft({ chat_id: root.id, text: "  " }), /空です/);
  ctx.store.chats.archive(grandchild.id, true);
  await assert.rejects(tools.addDraft({ chat_id: grandchild.id, text: "a" }), /アーカイブ済み/);
  assert.equal(published.length, 2);
});
