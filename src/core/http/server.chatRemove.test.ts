// チャットの AI がチャットをアーカイブする・消す（archive_chat・delete_chat の中身 ChatRemover）: 同じプロジェクトのチャットを子孫ごと・
// 作業中のものがあれば断る・自分（自分の祖先）は作業の終わりに行う予約（送信待ちは止める）
import assert from "node:assert/strict";
import { test } from "node:test";
import { setup, until } from "../testing/testServer.js";
import { tempDir } from "../testing/tempDir.js";

type Ctx = ReturnType<typeof setup>;

/** 動かして終わったチャット */
async function doneChat(ctx: Ctx, text: string) {
  const created = (await ctx.call("POST", `/api/projects/${ctx.project.id}/chats`, { text })).body;
  await until(() => ctx.store.chats.get(created.id)?.status === "completed");
  return created.id as number;
}

/** 動かして終わった子チャット */
async function doneChild(ctx: Ctx, parentId: number, text: string) {
  const created = (await ctx.call("POST", `/api/chats/${parentId}/children`, { text, inherit: false })).body;
  await until(() => ctx.store.chats.get(created.id)?.status === "completed");
  return created.id as number;
}

const notices = (ctx: Ctx, chatId: number) => ctx.store.events.list(chatId).flatMap((e) => (e.type === "notice" ? [e.data.message] : []));

test("archive_chat: 同じプロジェクトのほかの家系のチャットを子チャットごとアーカイブする。もうアーカイブ済み・ほかのプロジェクト・ないチャットは変えない", async () => {
  const ctx = setup();
  const { store, chatRemover } = ctx;
  const me = await doneChat(ctx, "わたし");
  const target = await doneChat(ctx, "片付ける");
  const child = await doneChild(ctx, target, "子");
  const text = chatRemover.fromChat(me, "archive", target);
  assert.match(text, /チャット「.*」（ID \d+）（子チャットなど 1 件も一緒に）をアーカイブしました/);
  assert.notEqual(store.chats.get(target)?.archived_at, null);
  assert.notEqual(store.chats.get(child)?.archived_at, null);
  assert.equal(store.chats.get(me)?.archived_at, null);
  assert.match(chatRemover.fromChat(me, "archive", target), /もうアーカイブしてあります/);
  // ほかのプロジェクトのチャット・ないチャットは断る
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const foreign = store.chats.create({ ...store.chats.get(me)!, project_id: other.id, title: "よそ", parent_chat_id: null, group_id: null, worktree_path: null, parent_event_id: null, memo_path: null });
  assert.throws(() => chatRemover.fromChat(me, "archive", foreign.id), /このプロジェクトにありません/);
  assert.throws(() => chatRemover.fromChat(me, "delete", 99999), /このプロジェクトにありません/);
  assert.equal(store.chats.get(foreign.id)?.archived_at, null);
});

test("delete_chat: 子チャットごと Kickoff のゴミ箱に入れ（消したチャットを覚える）、戻せる。作業中のチャットが含まれていれば待たずに断る", async () => {
  const ctx = setup();
  const { call, project, store, provider, runner, chatRemover } = ctx;
  const me = await doneChat(ctx, "わたし");
  const target = await doneChat(ctx, "消す");
  const child = await doneChild(ctx, target, "子");
  // 子が作業中なら断る（親を消すと子も消えるため）
  const release = provider.hold();
  await call("POST", `/api/chats/${child}/messages`, { text: "まだ作業中" });
  await until(() => runner.isBusy(child));
  assert.throws(() => chatRemover.fromChat(me, "delete", target), /作業中のチャット（「.*」）が含まれているので削除できません/);
  assert.ok(store.chats.get(target));
  release();
  await until(() => !runner.isBusy(child));
  assert.match(chatRemover.fromChat(me, "delete", target), /（子チャットなど 1 件も一緒に）を Kickoff のゴミ箱に入れました。3 日間/);
  assert.equal(store.chats.get(target), undefined);
  assert.equal(store.chats.get(child), undefined);
  const [item] = (await call("GET", `/api/projects/${project.id}/trash`)).body;
  assert.equal(item.kind, "chat");
  assert.equal(item.by_chat_id, me);
  assert.equal((await call("POST", `/api/trash/${item.id}/restore`, {})).status, 200);
  assert.ok(store.chats.get(target));
  assert.ok(store.chats.get(child));
});

test("自分のアーカイブ: 作業中は予約だけして、作業が終わったらアーカイブし、送信待ちは止めてお知らせを残す", async () => {
  const ctx = setup();
  const { call, store, provider, runner, chatRemover } = ctx;
  const me = await doneChat(ctx, "わたし");
  const release = provider.hold();
  await call("POST", `/api/chats/${me}/messages`, { text: "片付けて" });
  await until(() => runner.isBusy(me));
  const text = chatRemover.fromChat(me, "archive", me);
  assert.match(text, /予約しました。このチャットの作業が終わったら、Kickoff がチャット「.*」（ID \d+）をアーカイブします/);
  assert.equal((await call("POST", `/api/chats/${me}/queue`, { text: "次の指示" })).body.queued, true);
  assert.equal(store.chats.get(me)?.archived_at, null, "作業中はまだしまわない");
  release();
  await until(() => store.chats.get(me)?.archived_at !== null);
  assert.match(notices(ctx, me).at(-1) ?? "", /^予約どおり、チャット「.*」（ID \d+）をアーカイブしました/);
  const queue = (await call("GET", `/api/chats/${me}`)).body.live.queue;
  assert.equal(queue.paused, true);
  assert.equal(queue.messages.length, 1);
  assert.equal(runner.isBusy(me), false);
});

test("祖先の削除: 子チャットから親を頼まれたら、子の作業が終わってから子孫ごとゴミ箱に入れる", async () => {
  const ctx = setup();
  const { call, store, provider, runner, chatRemover } = ctx;
  const parent = await doneChat(ctx, "親");
  const child = await doneChild(ctx, parent, "子");
  const release = provider.hold();
  await call("POST", `/api/chats/${child}/messages`, { text: "親ごと消して" });
  await until(() => runner.isBusy(child));
  assert.match(chatRemover.fromChat(child, "delete", parent), /予約しました。.*（子チャットなど 1 件も一緒に）を削除します/);
  assert.ok(store.chats.get(parent));
  release();
  await until(() => store.chats.get(parent) === undefined);
  assert.equal(store.chats.get(child), undefined);
});
