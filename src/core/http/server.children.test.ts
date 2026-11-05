// API のテスト: 子チャット（作る・親の会話を引き継ぐ / 引き継がない・子孫ごとのアーカイブ・移動・削除。共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "node:test";
import { tempDir } from "../testing/tempDir.js";
import { setup, until } from "../testing/testServer.js";

/** 1 回送って終わったチャットを作る */
async function finishedChat(ctx: ReturnType<typeof setup>, text = "親の質問") {
  const id: number = (await ctx.call("POST", `/api/projects/${ctx.project.id}/chats`, { text })).body.id;
  await until(() => ctx.store.chats.get(id)?.status === "completed");
  return id;
}

test("子チャット: 親の会話を引き継ぐと、親の最後まで終わった作業の時点から会話を写して始める（親が作業中でも）", async () => {
  const ctx = setup();
  const { call, store, provider, runner, project } = ctx;
  const parentId = await finishedChat(ctx);
  const answer = store.events.list(parentId).find((e) => e.type === "result")!;
  // 親を作業中にしたまま子チャットで聞ける
  const release = provider.hold();
  await call("POST", `/api/chats/${parentId}/messages`, { text: "続き" });
  const created = await call("POST", `/api/chats/${parentId}/children`, { text: "これはどういう意味？", quote: "Hono の middleware", inherit: true, event_id: answer.id });
  assert.equal(created.status, 201);
  const child = created.body;
  assert.equal(child.parent_chat_id, parentId);
  assert.equal(child.parent_event_id, answer.id);
  assert.equal(child.title, "これはどういう意味？");
  assert.equal(child.session_id, "fork-1");
  assert.deepEqual(provider.forks, [["s1", "m1", project.repo_path]]);
  // 最初の発言は、選んだ文の引用 ＋ 質問。前に引き継いだことのお知らせ
  const events = store.events.list(child.id);
  assert.deepEqual(events.slice(0, 2).map((e) => e.type), ["notice", "user"]);
  const user = events[1];
  assert.equal(user.type === "user" && user.data.text, "> Hono の middleware\n\nこれはどういう意味？");
  // 続きのセッションから動く
  await until(() => provider.resumes.includes("fork-1"));
  release();
  await until(() => !runner.isBusy(parentId) && !runner.isBusy(child.id));
});

test("子チャット: 文の頭に引用を入れて送ると、引用はそのまま指示に入り、名前は引用のあとの文から付ける", async () => {
  const ctx = setup();
  const parentId = await finishedChat(ctx);
  const child = (await ctx.call("POST", `/api/chats/${parentId}/children`, { text: "> 選んだ文\n>\n> 2 行目\n\nここを直したい", quote: null, inherit: false })).body;
  assert.equal(child.title, "ここを直したい");
  const user = ctx.store.events.list(child.id).find((e) => e.type === "user");
  assert.equal(user?.type === "user" && user.data.text, "> 選んだ文\n>\n> 2 行目\n\nここを直したい");
  await until(() => !ctx.runner.isBusy(child.id));
});

test("子チャット: 引き継がない・引き継げる会話がないときは、選んだ文と質問だけで始める", async () => {
  const ctx = setup();
  const { call, store, provider } = ctx;
  const parentId = await finishedChat(ctx);
  const fresh = (await call("POST", `/api/chats/${parentId}/children`, { text: "質問", inherit: false })).body;
  assert.equal(provider.forks.length, 0);
  const first = store.events.list(fresh.id)[0];
  assert.match(first.type === "notice" ? first.data.message : "", /引き継がずに/);
  await until(() => !ctx.runner.isBusy(fresh.id));

  // まだ終わった作業のない親（作業中のまま）からは、引き継げないことを知らせて始める
  const release = provider.hold();
  const busyParent: number = (await call("POST", `/api/projects/${ctx.project.id}/chats`, { text: "長い作業" })).body.id;
  const child = (await call("POST", `/api/chats/${busyParent}/children`, { text: "横で質問", inherit: true })).body;
  const notice = store.events.list(child.id)[0];
  assert.match(notice.type === "notice" ? notice.data.message : "", /引き継げる会話がまだない/);
  release();
  await until(() => !ctx.runner.isBusy(busyParent) && !ctx.runner.isBusy(child.id));
  // 文がないと 400
  assert.equal((await call("POST", `/api/chats/${parentId}/children`, { text: "" })).status, 400);
});

test("子チャット: 親をアーカイブ・移動・削除すると、子孫（子・孫）も一緒に扱う", async () => {
  const ctx = setup();
  const { call, store, runner } = ctx;
  const parentId = await finishedChat(ctx);
  const child = (await call("POST", `/api/chats/${parentId}/children`, { text: "子", inherit: false })).body;
  await until(() => !runner.isBusy(child.id));
  const grandchild = (await call("POST", `/api/chats/${child.id}/children`, { text: "孫", inherit: false })).body;
  await until(() => !runner.isBusy(grandchild.id));
  assert.deepEqual(store.chats.descendants(parentId).map((c) => c.id), [grandchild.id, child.id]);

  await call("PATCH", `/api/chats/${parentId}`, { archived: true });
  assert.ok(store.chats.get(child.id)!.archived_at && store.chats.get(grandchild.id)!.archived_at);
  await call("PATCH", `/api/chats/${parentId}`, { archived: false });
  assert.equal(store.chats.get(grandchild.id)!.archived_at, null);

  const other = store.projects.create({ name: "別", repo_path: tempDir(), provider: "claude" });
  await call("POST", `/api/chats/${parentId}/move`, { project_id: other.id });
  assert.deepEqual([child.id, grandchild.id].map((id) => store.chats.get(id)!.project_id), [other.id, other.id]);

  assert.equal((await call("DELETE", `/api/chats/${parentId}`)).status, 204);
  assert.deepEqual([parentId, child.id, grandchild.id].map((id) => store.chats.get(id)), [undefined, undefined, undefined]);
});
