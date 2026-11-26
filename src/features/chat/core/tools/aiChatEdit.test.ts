// チャットの AI が同じ家系のチャットの名前・固定・グループを変え、子チャットを親から外すツールの中身（家系の範囲・断る場合・省いた項目・渡し方）
import assert from "node:assert/strict";
import { test } from "vitest";
import { ScriptedProvider } from "@/features/ai/core/testing";
import { setupCore, until, watchTools } from "@/app/core/testing/testCore";
import { McpToolHost } from "@/foundation/core/aiTools/host";
import type { Chat } from "@shared/chat/types";
import { createAiChatEditTools } from "./aiChatEdit";

/** 聞かずに変えるはずの呼び出しに渡す ask（呼ばれたら落とす） */
const noAsk = async (): Promise<never> => {
  throw new Error("聞かずに変えるはずが、承認を聞きました");
};

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
  const base = { project_id: project.id, provider: "claude" as const, status: "completed" as const, model: null, effort: null, permission_mode: "default" as const, fast_mode: false, group_id: null, worktree_path: null, parent_event_id: null, note_path: null };
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
  const listed = JSON.parse(createAiChatEditTools({ store: ctx.store, detach: ctx.detach }, grandchild.id).listFamily());
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

test("update_chat: 兄弟の名前を変え、省いた項目（固定・グループ）は変えない", async () => {
  const ctx = setup();
  const { root, childA, childB } = family(ctx);
  const group = ctx.store.groups.create(ctx.project.id, "調査");
  ctx.store.chats.setGroup(root.id, group.id);
  ctx.store.chats.setPinned(root.id, true);
  const tools = createAiChatEditTools({ store: ctx.store, detach: ctx.detach }, childA.id);
  const result = await tools.update({ chat_id: childB.id, title: "  【済】子B  " }, noAsk);
  assert.match(result, /兄弟/);
  assert.match(result, /名前を「子B」から「【済】子B」に変えた/);
  assert.equal(ctx.store.chats.get(childB.id)?.title, "【済】子B");
  // 親の固定だけを外す（名前・グループはそのまま）
  await tools.update({ chat_id: root.id, pinned: false }, noAsk);
  const after = ctx.store.chats.get(root.id)!;
  assert.deepEqual([after.title, after.pinned, after.group_id], ["根", false, group.id]);
});

test("update_chat: group_id は入れる・null で外す。もともとの値なら変えずにそう返す", async () => {
  const ctx = setup();
  const { root, grandchild } = family(ctx);
  const group = ctx.store.groups.create(ctx.project.id, "調査");
  const tools = createAiChatEditTools({ store: ctx.store, detach: ctx.detach }, grandchild.id);
  assert.match(await tools.update({ chat_id: root.id, group_id: group.id }, noAsk), /グループ「調査」に入れた/);
  assert.equal(ctx.store.chats.get(root.id)?.group_id, group.id);
  assert.match(await tools.update({ chat_id: root.id, group_id: null }, noAsk), /グループから外した/);
  assert.equal(ctx.store.chats.get(root.id)?.group_id, null);
  assert.match(await tools.update({ chat_id: root.id, group_id: null, pinned: false }, noAsk), /変えていません/);
});

test("update_chat: 家系の外のチャットは、同じプロジェクトなら名前だけ変えられる（固定・グループ・親から外す・ほかのプロジェクト・ないチャットは断る）", async () => {
  const ctx = setup();
  const { childA, other } = family(ctx);
  const otherProject = ctx.store.projects.create({ name: "q", repo_path: "/tmp/kickoff-test-other", provider: "claude" });
  const base = { provider: "claude" as const, status: "completed" as const, model: null, effort: null, permission_mode: "default" as const, fast_mode: false, group_id: null, worktree_path: null, parent_event_id: null, note_path: null, parent_chat_id: null };
  const foreignChat = ctx.store.chats.create({ ...base, project_id: otherProject.id, title: "よそのプロジェクト" });
  const tools = createAiChatEditTools({ store: ctx.store, detach: ctx.detach }, childA.id);
  assert.match(await tools.update({ chat_id: other.id, title: " 【済】よそ " }, noAsk), /ほかの家系.*「よそ」から「【済】よそ」/);
  assert.equal(ctx.store.chats.get(other.id)?.title, "【済】よそ");
  assert.match(await tools.update({ chat_id: other.id, title: "【済】よそ" }, noAsk), /変えていません/);
  // 名前と一緒でも、家系の外の固定・グループ・親から外すは断り、名前も変えない
  await assert.rejects(tools.update({ chat_id: other.id, title: "x", pinned: true }, noAsk), /家系.*名前（title）だけ/);
  await assert.rejects(tools.update({ chat_id: other.id, group_id: null }, noAsk), /名前（title）だけ/);
  await assert.rejects(tools.update({ chat_id: other.id, parent_id: null }, noAsk), /名前（title）だけ/);
  await assert.rejects(tools.update({ chat_id: other.id, title: "   " }, noAsk), /空/);
  assert.equal(ctx.store.chats.get(other.id)?.title, "【済】よそ");
  assert.equal(ctx.store.chats.get(other.id)?.pinned, false);
  await assert.rejects(tools.update({ chat_id: foreignChat.id, title: "x" }, noAsk), /このプロジェクトにありません/);
  await assert.rejects(tools.update({ chat_id: 99999, title: "x" }, noAsk), /このプロジェクトにありません/);
  assert.equal(ctx.store.chats.get(foreignChat.id)?.title, "よそのプロジェクト");
});

test("update_chat: ほかのプロジェクトのグループ・子チャットのグループ・空の名前・項目なしは断り、何も変えない", async () => {
  const ctx = setup();
  const { root, childA, other } = family(ctx);
  const otherProject = ctx.store.projects.create({ name: "q", repo_path: "/tmp/kickoff-test-other", provider: "claude" });
  const foreign = ctx.store.groups.create(otherProject.id, "よその");
  const tools = createAiChatEditTools({ store: ctx.store, detach: ctx.detach }, childA.id);
  await assert.rejects(tools.update({ chat_id: other.id, pinned: true }, noAsk), /家系.*ありません/);
  await assert.rejects(tools.update({ chat_id: 99999, pinned: true }, noAsk), /このプロジェクトにありません/);
  // 名前は正しくても、グループが通らなければ名前も変えない（先にすべて確かめる）
  await assert.rejects(tools.update({ chat_id: root.id, title: "新しい名前", group_id: foreign.id }, noAsk), /このプロジェクトにありません/);
  await assert.rejects(tools.update({ chat_id: root.id, group_id: 99999 }, noAsk), /このプロジェクトにありません/);
  await assert.rejects(tools.update({ chat_id: childA.id, group_id: null }, noAsk), /子チャットはグループに入りません/);
  await assert.rejects(tools.update({ chat_id: root.id, title: "   " }, noAsk), /空/);
  await assert.rejects(tools.update({ chat_id: root.id }, noAsk), /変える項目がありません/);
  assert.equal(ctx.store.chats.get(root.id)?.title, "根");
  assert.equal(ctx.store.chats.get(other.id)?.pinned, false);
});

test("update_chat: parent_id で子チャットを親から外す（null = 親なしで、group_id を一緒に渡せばグループへ / 先祖の ID = その子に上げる）", async () => {
  const ctx = setup();
  const { root, childA, childB, grandchild } = family(ctx);
  const group = ctx.store.groups.create(ctx.project.id, "本筋");
  const tools = createAiChatEditTools({ store: ctx.store, detach: ctx.detach }, root.id);
  assert.match(await tools.update({ chat_id: grandchild.id, parent_id: root.id }, noAsk), /「子A」から「根」の子に上げた/);
  assert.equal(ctx.store.chats.get(grandchild.id)?.parent_chat_id, root.id);
  assert.match(await tools.update({ chat_id: childB.id, parent_id: null, group_id: group.id }, noAsk), /「根」から外して親のないチャットにした（グループ「本筋」）/);
  const detached = ctx.store.chats.get(childB.id)!;
  assert.deepEqual([detached.parent_chat_id, detached.group_id], [null, group.id]);
  // 記録にお知らせを残す
  const notice = ctx.store.events.list(childB.id).at(-1);
  assert.equal(notice?.type === "notice" && notice.data.message, "「根」から外しました");
  assert.equal(ctx.store.chats.get(childA.id)?.parent_chat_id, root.id);
});

test("update_chat: 親から外せないとき（親のないチャット・先祖でない ID・先祖の子に上げながらグループ・作業中）は断り、ほかの項目も変えない", async () => {
  const ctx = setup();
  const { root, childA, childB, grandchild, other } = family(ctx);
  const group = ctx.store.groups.create(ctx.project.id, "本筋");
  const tools = createAiChatEditTools({ store: ctx.store, detach: ctx.detach }, root.id);
  await assert.rejects(tools.update({ chat_id: root.id, parent_id: null }, noAsk), /親のないチャットです/);
  await assert.rejects(tools.update({ chat_id: grandchild.id, title: "新しい", parent_id: childB.id }, noAsk), /親から外せませんでした: 上げられるのは、自分の先祖/);
  await assert.rejects(tools.update({ chat_id: grandchild.id, parent_id: other.id }, noAsk), /先祖/);
  await assert.rejects(tools.update({ chat_id: grandchild.id, parent_id: root.id, group_id: group.id }, noAsk), /グループに入れられるのは親のないチャットだけ/);
  // 断る決まりは childChats の口（作業中は外せない）。口が断ったら、ほかの項目も変えずに理由の文で返す
  const busy = { detach: (chat: Chat, target: { parentId: number | null }) => (chat.id === childA.id ? (() => { throw new Error("作業中のチャットは親から外せません"); })() : ctx.detach.detach(chat, target)) };
  const busyTools = createAiChatEditTools({ store: ctx.store, detach: busy }, root.id);
  await assert.rejects(busyTools.update({ chat_id: childA.id, title: "変えない", parent_id: null }, noAsk), /親から外せませんでした: 作業中/);
  assert.equal(ctx.store.chats.get(childA.id)?.title, "子A");
  assert.equal(ctx.store.chats.get(grandchild.id)?.title, "孫");
  assert.equal(ctx.store.chats.get(grandchild.id)?.parent_chat_id, childA.id);
  assert.equal(ctx.store.chats.get(childA.id)?.parent_chat_id, root.id);
});

test("渡し方: 名前・固定・グループのツールは、チャットを作らせない設定のときも孫チャットにも渡す", async () => {
  const host = new McpToolHost(() => "http://127.0.0.1:1");
  const ctx = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "s", turns: 1 })), { toolHost: host });
  const tools = watchTools(ctx, host);
  ctx.store.settings.update({ ai_create_chat: "off" });
  const parent = await ctx.runner.start({ projectId: ctx.project.id, prompt: "親" });
  await until(() => ctx.store.chats.get(parent.id)?.status === "completed");
  const child = await ctx.runner.start({ projectId: ctx.project.id, prompt: "子", parentChatId: parent.id });
  await until(() => ctx.store.chats.get(child.id)?.status === "completed");
  const grandchild = await ctx.runner.start({ projectId: ctx.project.id, prompt: "孫", parentChatId: child.id });
  await until(() => ctx.store.chats.get(grandchild.id)?.status === "completed");
  assert.ok(!tools.names().includes("create_chat"), "チャットを作るツールは渡さない");
  assert.ok(tools.names().includes("update_chat"), "名前・固定・グループのツールは渡す");
  // 渡したツールは、そのチャット（孫）から見た家系を返す
  const listed = JSON.parse(await tools.call("list_family_chats"));
  assert.equal(listed.self_id, grandchild.id);
  assert.equal(listed.chats.length, 3);
});

test("update_chat: 共通のチャットからは、ほかのプロジェクトのチャットの名前・固定・グループを、設定に従って聞いてから変える", async () => {
  const ctx = setup();
  const { store, project } = ctx;
  const { other } = family(ctx);
  const group = store.groups.create(project.id, "調査");
  const common = store.projects.create({ name: "共通", repo_path: `${project.repo_path}-common`, provider: "claude", kind: "common" });
  const self = store.chats.create({ ...{ provider: "claude" as const, status: "completed" as const, model: null, effort: null, permission_mode: "default" as const, fast_mode: false, group_id: null, worktree_path: null, parent_event_id: null, note_path: null }, project_id: common.id, title: "共通の", parent_chat_id: null });
  const tools = createAiChatEditTools({ store, detach: ctx.detach }, self.id);
  const cards: string[] = [];
  const answer = (action: "allow" | "allow_always" | "deny") => async (card: { title: string }) => (cards.push(card.title), action === "deny" ? { action, message: null } : { action });
  // 共通の中のチャット（自分）は聞かずに変える
  assert.match(await tools.update({ chat_id: self.id, title: "共通の" }, noAsk), /変えていません/);
  await assert.rejects(tools.update({ chat_id: other.id, parent_id: null }, answer("allow")), /親から外せません/);
  await assert.rejects(tools.update({ chat_id: other.id, title: "x" }, answer("deny")), /利用者が断りました/);
  assert.equal(store.chats.get(other.id)!.title, "よそ");
  // 毎回聞く → 常に許可で「共通のチャットがほかのプロジェクトに書くとき」だけが聞かずに書くになる
  assert.match(await tools.update({ chat_id: other.id, title: "【済】よそ", pinned: true, group_id: group.id, project: project.name }, answer("allow_always")), /名前を「【済】よそ」に変えた・固定した・グループ「調査」に入れた/);
  assert.deepEqual([store.chats.get(other.id)!.title, store.chats.get(other.id)!.pinned, store.chats.get(other.id)!.group_id], ["【済】よそ", true, group.id]);
  assert.deepEqual([store.settings.get().ai_write_other_projects, store.settings.get().ai_create_chat], ["allow", "ask"]);
  assert.equal(cards.length, 2);
  await tools.update({ chat_id: other.id, pinned: false }, answer("deny"));
  assert.equal(cards.length, 2);
  // 書かせないなら聞かずに断る
  store.settings.update({ ai_write_other_projects: "off" });
  await assert.rejects(tools.update({ chat_id: other.id, title: "y" }, answer("allow")), /書くのを止めています/);
  assert.equal(cards.length, 2);
});

test("update_chat: プロジェクトのチャットからは、ほかのプロジェクトのチャットを指せない（いまのまま）", async () => {
  const ctx = setup();
  const { root } = family(ctx);
  const elsewhere = ctx.store.projects.create({ name: "別", repo_path: `${ctx.project.repo_path}-other`, provider: "claude" });
  const foreign = ctx.store.chats.create({ ...{ provider: "claude" as const, status: "completed" as const, model: null, effort: null, permission_mode: "default" as const, fast_mode: false, group_id: null, worktree_path: null, parent_event_id: null, note_path: null }, project_id: elsewhere.id, title: "別の", parent_chat_id: null });
  const tools = createAiChatEditTools({ store: ctx.store, detach: ctx.detach }, root.id);
  await assert.rejects(tools.update({ chat_id: foreign.id, title: "x" }, noAsk), /このプロジェクトにありません/);
  await assert.rejects(tools.update({ chat_id: root.id, title: "x", project: "別" }, noAsk), /ほかのプロジェクトを指せません/);
});
