// チャットの AI が同じ家系のチャットの名前・固定・グループを変え、子チャットを親から外すツールの中身（家系の範囲・断る場合・省いた項目・渡し方）
import assert from "node:assert/strict";
import { test } from "node:test";
import { ScriptedProvider } from "../testing/fakeProvider.js";
import { setupCore, until } from "../testing/testCore.js";
import { createAiChatEditTools } from "./aiChatEdit.js";

/** どのチャットも作業中でない */
const idle = () => false;

/** すぐ終わる偽のプロバイダーで組み立てる */
function setup() {
  const provider = new ScriptedProvider(async (params) => ({ status: "completed", sessionId: "s", turns: 1, result: params.prompt }));
  return setupCore(provider);
}

/**
 * 家系: 根 ─┬─ 子A ─── 孫
 *           └─ 子B
 * と、別の家系の「よそ」
 */
function family(ctx: ReturnType<typeof setup>) {
  const { store, project } = ctx;
  const base = { project_id: project.id, provider: "claude" as const, status: "completed" as const, model: null, effort: null, permission_mode: "default" as const, fast_mode: false, group_id: null, worktree_path: null, parent_event_id: null, memo_path: null };
  const root = store.chats.create({ ...base, title: "根", parent_chat_id: null });
  const childA = store.chats.create({ ...base, title: "子A", parent_chat_id: root.id });
  const childB = store.chats.create({ ...base, title: "子B", parent_chat_id: root.id });
  const grandchild = store.chats.create({ ...base, title: "孫", parent_chat_id: childA.id });
  const other = store.chats.create({ ...base, title: "よそ", parent_chat_id: null });
  return { root, childA, childB, grandchild, other };
}

test("list_family_chats: 兄弟・親の兄弟まで、同じ家系のチャットを関係と一緒に返す（家系の外は入れない）", () => {
  const ctx = setup();
  const { root, childA, childB, grandchild } = family(ctx);
  const group = ctx.store.groups.create(ctx.project.id, "調査");
  ctx.store.chats.setGroup(root.id, group.id);
  ctx.store.chats.setPinned(childB.id, true);
  const listed = JSON.parse(createAiChatEditTools(ctx.store, grandchild.id, idle).listFamily());
  assert.equal(listed.self_id, grandchild.id);
  assert.deepEqual(
    listed.chats.map((c: { id: number; relation: string; is_self: boolean }) => [c.id, c.relation, c.is_self]),
    [
      [root.id, "祖父母", false],
      [childA.id, "親", false],
      [grandchild.id, "自分", true],
      [childB.id, "親の兄弟", false],
    ],
  );
  assert.deepEqual(listed.chats[0].group, { id: group.id, name: "調査" });
  assert.equal(listed.chats[3].pinned, true);
  assert.deepEqual(listed.groups, [{ id: group.id, name: "調査" }]);
});

test("update_chat: 兄弟の名前を変え、省いた項目（固定・グループ）は変えない", () => {
  const ctx = setup();
  const { root, childA, childB } = family(ctx);
  const group = ctx.store.groups.create(ctx.project.id, "調査");
  ctx.store.chats.setGroup(root.id, group.id);
  ctx.store.chats.setPinned(root.id, true);
  const tools = createAiChatEditTools(ctx.store, childA.id, idle);
  const result = tools.update({ chat_id: childB.id, title: "  【済】子B  " });
  assert.match(result, /兄弟/);
  assert.match(result, /名前を「子B」から「【済】子B」に変えた/);
  assert.equal(ctx.store.chats.get(childB.id)?.title, "【済】子B");
  // 親の固定だけを外す（名前・グループはそのまま）
  tools.update({ chat_id: root.id, pinned: false });
  const after = ctx.store.chats.get(root.id)!;
  assert.deepEqual([after.title, after.pinned, after.group_id], ["根", false, group.id]);
});

test("update_chat: group_id は入れる・null で外す。もともとの値なら変えずにそう返す", () => {
  const ctx = setup();
  const { root, grandchild } = family(ctx);
  const group = ctx.store.groups.create(ctx.project.id, "調査");
  const tools = createAiChatEditTools(ctx.store, grandchild.id, idle);
  assert.match(tools.update({ chat_id: root.id, group_id: group.id }), /グループ「調査」に入れた/);
  assert.equal(ctx.store.chats.get(root.id)?.group_id, group.id);
  assert.match(tools.update({ chat_id: root.id, group_id: null }), /グループから外した/);
  assert.equal(ctx.store.chats.get(root.id)?.group_id, null);
  assert.match(tools.update({ chat_id: root.id, group_id: null, pinned: false }), /変えていません/);
});

test("update_chat: 家系の外・ほかのプロジェクトのグループ・子チャットのグループ・空の名前・項目なしは断り、何も変えない", () => {
  const ctx = setup();
  const { root, childA, other } = family(ctx);
  const otherProject = ctx.store.projects.create({ name: "q", repo_path: "/tmp/kickoff-test-other", provider: "claude" });
  const foreign = ctx.store.groups.create(otherProject.id, "よその");
  const tools = createAiChatEditTools(ctx.store, childA.id, idle);
  assert.throws(() => tools.update({ chat_id: other.id, title: "x" }), /家系.*ありません.*list_family_chats/);
  assert.throws(() => tools.update({ chat_id: 99999, pinned: true }), /家系/);
  // 名前は正しくても、グループが通らなければ名前も変えない（先にすべて確かめる）
  assert.throws(() => tools.update({ chat_id: root.id, title: "新しい名前", group_id: foreign.id }), /このプロジェクトにありません/);
  assert.throws(() => tools.update({ chat_id: root.id, group_id: 99999 }), /このプロジェクトにありません/);
  assert.throws(() => tools.update({ chat_id: childA.id, group_id: null }), /子チャットはグループに入りません/);
  assert.throws(() => tools.update({ chat_id: root.id, title: "   " }), /空/);
  assert.throws(() => tools.update({ chat_id: root.id }), /変える項目がありません/);
  assert.equal(ctx.store.chats.get(root.id)?.title, "根");
  assert.equal(ctx.store.chats.get(other.id)?.title, "よそ");
});

test("update_chat: parent_id で子チャットを親から外す（null = 親なしで、group_id を一緒に渡せばグループへ / 先祖の ID = その子に上げる）", () => {
  const ctx = setup();
  const { root, childA, childB, grandchild } = family(ctx);
  const group = ctx.store.groups.create(ctx.project.id, "本筋");
  const tools = createAiChatEditTools(ctx.store, root.id, idle);
  assert.match(tools.update({ chat_id: grandchild.id, parent_id: root.id }), /「子A」から「根」の子に上げた/);
  assert.equal(ctx.store.chats.get(grandchild.id)?.parent_chat_id, root.id);
  assert.match(tools.update({ chat_id: childB.id, parent_id: null, group_id: group.id }), /「根」から外して親のないチャットにした（グループ「本筋」）/);
  const detached = ctx.store.chats.get(childB.id)!;
  assert.deepEqual([detached.parent_chat_id, detached.group_id], [null, group.id]);
  // 記録にお知らせを残す
  const notice = ctx.store.events.list(childB.id).at(-1);
  assert.equal(notice?.type === "notice" && notice.data.message, "「根」から外しました");
  assert.equal(ctx.store.chats.get(childA.id)?.parent_chat_id, root.id);
});

test("update_chat: 親から外せないとき（親のないチャット・先祖でない ID・先祖の子に上げながらグループ・作業中）は断り、ほかの項目も変えない", () => {
  const ctx = setup();
  const { root, childA, childB, grandchild, other } = family(ctx);
  const group = ctx.store.groups.create(ctx.project.id, "本筋");
  const tools = createAiChatEditTools(ctx.store, root.id, idle);
  assert.throws(() => tools.update({ chat_id: root.id, parent_id: null }), /親のないチャットです/);
  assert.throws(() => tools.update({ chat_id: grandchild.id, title: "新しい", parent_id: childB.id }), /親から外せませんでした: 上げられるのは、自分の先祖/);
  assert.throws(() => tools.update({ chat_id: grandchild.id, parent_id: other.id }), /先祖/);
  assert.throws(() => tools.update({ chat_id: grandchild.id, parent_id: root.id, group_id: group.id }), /グループに入れられるのは親のないチャットだけ/);
  const busyTools = createAiChatEditTools(ctx.store, root.id, (id) => id === childA.id);
  assert.throws(() => busyTools.update({ chat_id: childA.id, parent_id: null }), /作業中/);
  assert.equal(ctx.store.chats.get(grandchild.id)?.title, "孫");
  assert.equal(ctx.store.chats.get(grandchild.id)?.parent_chat_id, childA.id);
  assert.equal(ctx.store.chats.get(childA.id)?.parent_chat_id, root.id);
});

test("渡し方: 名前・固定・グループのツールは、子チャットを作らせない設定のときも孫チャットにも渡す", async () => {
  const ctx = setup();
  ctx.store.settings.update({ ai_child_chat: "off" });
  const parent = await ctx.runner.start({ projectId: ctx.project.id, prompt: "親" });
  await until(() => ctx.store.chats.get(parent.id)?.status === "completed");
  const child = await ctx.runner.start({ projectId: ctx.project.id, prompt: "子", parentChatId: parent.id });
  await until(() => ctx.store.chats.get(child.id)?.status === "completed");
  const grandchild = await ctx.runner.start({ projectId: ctx.project.id, prompt: "孫", parentChatId: child.id });
  await until(() => ctx.store.chats.get(grandchild.id)?.status === "completed");
  const params = ctx.provider.calls.at(-1)!;
  assert.equal(params.childChat, null, "子チャットを作るツールは渡さない");
  assert.ok(params.chatEdit, "名前・固定・グループのツールは渡す");
  // 渡したツールは、そのチャット（孫）から見た家系を返す
  const listed = JSON.parse(params.chatEdit.listFamily());
  assert.equal(listed.self_id, grandchild.id);
  assert.equal(listed.chats.length, 3);
});
