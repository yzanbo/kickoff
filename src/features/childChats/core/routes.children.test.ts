// API のテスト: 子チャット（作る・親の会話を引き継ぐ / 引き継がない・引用・添付・子孫ごとのアーカイブ・移動・削除。共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "vitest";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { setup, until } from "@/app/core/testing/testServer";
import { chatOf, eventsOf, isBusy, liveOf, sendAndWait, untilIdle } from "@/features/chat/core/testing";

/** 1 回送って終わったチャットを作る */
const finishedChat = (ctx: ReturnType<typeof setup>, text = "親の質問") => sendAndWait(ctx, { projectId: ctx.project.id, text });

test("子チャット: 親の会話を引き継ぐと、親の最後まで終わった作業の時点から会話を写して始める（親が作業中でも）", async () => {
  const ctx = setup({ features: ["childChats", "settings", "workplaceMove"] });
  const { api, provider, project } = ctx;
  const parentId = await finishedChat(ctx);
  const answer = (await eventsOf(ctx, parentId)).find((e) => e.type === "result")!;
  // 親を作業中にしたまま子チャットで聞ける
  const release = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: parentId }, body: { text: "続き" } });
  const created = await api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "これはどういう意味？", quote: "Hono の middleware", inherit: true, event_id: answer.id } });
  assert.equal(created.status, 201);
  const child = created.body;
  assert.equal(child.parent_chat_id, parentId);
  assert.equal(child.parent_event_id, answer.id);
  assert.equal(child.title, "これはどういう意味？");
  await until(async () => (await chatOf(ctx, child.id)).session_id === "fork-1");
  assert.deepEqual(provider.forks, [["s1", "m1", project.repo_path]]);
  // 最初の発言は、選んだ文の引用 ＋ 質問。前に引き継いだことのお知らせ
  const events = (await eventsOf(ctx, child.id));
  assert.deepEqual(events.slice(0, 2).map((e) => e.type), ["notice", "user"]);
  const user = events[1];
  assert.equal(user.type === "user" && user.data.text, "> Hono の middleware\n\nこれはどういう意味？");
  // 続きのセッションから動く
  await until(() => provider.resumes.includes("fork-1"));
  release();
  await until(async () => !(await isBusy(ctx, parentId)) && !(await isBusy(ctx, child.id)));
});

test("子チャット: 親の会話を写すのを待たずに作って最初の発言を残し、写している間は作業中（送る準備の理由が inherit）。写し終えたらそのセッションで動かす", async () => {
  const ctx = setup({ features: ["childChats", "settings", "workplaceMove"] });
  const { call, api, provider } = ctx;
  const parentId = await finishedChat(ctx);
  const release = provider.holdFork();
  const created = await api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "長い親から聞く", inherit: true } });
  assert.equal(created.status, 201);
  const child = created.body;
  // まだ写している: 発言は残り、作業中で、引き継ぎ中の様子を配る。プロバイダーはまだ動かさない
  assert.deepEqual((await eventsOf(ctx, child.id)).map((e) => e.type), ["notice", "user"]);
  assert.equal((await isBusy(ctx, child.id)), true);
  assert.equal((await liveOf(ctx, child.id)).preparing_for, "inherit");
  assert.equal(child.session_id, null);
  const turnsBefore = provider.resumes.length;
  // 写している間の「いま」は預かる
  assert.equal((await call("POST", `/api/chats/${child.id}/messages`, { text: "ついでに", when: "now" })).body.result, "held");
  assert.equal(provider.resumes.length, turnsBefore);
  const releaseTurn = provider.hold();
  release();
  await until(() => provider.resumes.includes("fork-1"));
  assert.equal((await chatOf(ctx, child.id)).session_id !== null, true);
  assert.notEqual((await liveOf(ctx, child.id)).preparing_for, "inherit");
  // 預かった「いま」は、動かし始めた作業に伝える
  await until(() => provider.told.includes("ついでに"));
  releaseTurn();
  await untilIdle(ctx, child.id);
});

test("子チャット: 親の会話を写している間に止めると、写し終えたところでプロバイダーを動かさずに中断で終える", async () => {
  const ctx = setup({ features: ["childChats", "settings", "workplaceMove"] });
  const { api, provider } = ctx;
  const parentId = await finishedChat(ctx);
  const release = provider.holdFork();
  const child = (await api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "やっぱりやめる", inherit: true } })).body;
  const turnsBefore = provider.resumes.length;
  assert.equal((await api("POST /api/chats/:chatId/cancel", { params: { chatId: child.id } })).status, 204);
  assert.equal((await liveOf(ctx, child.id)).stopping, true);
  release();
  await untilIdle(ctx, child.id);
  assert.equal(provider.resumes.length, turnsBefore);
  assert.equal((await chatOf(ctx, child.id)).status, "cancelled");
  assert.equal((await liveOf(ctx, child.id)).stopping, false);
});

test("子チャット: 親の会話を写せなければ、お知らせを残して引き継がずに動かす", async () => {
  const ctx = setup({ features: ["childChats", "settings", "workplaceMove"] });
  const { api, provider } = ctx;
  const parentId = await finishedChat(ctx);
  provider.forkError = "ENOSPC: no space left on device";
  const child = (await api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "聞きたい", inherit: true } })).body;
  assert.equal(child.status === "running" || (await isBusy(ctx, child.id)), true);
  await until(async () => !(await isBusy(ctx, child.id)) && (await chatOf(ctx, child.id)).status === "completed");
  const notices = (await eventsOf(ctx, child.id)).flatMap((e) => (e.type === "notice" ? [e.data.message] : []));
  assert.ok(notices.some((m) => m.includes("親の会話を引き継げませんでした（ENOSPC: no space left on device）")));
  // 引き継がずに（続きのセッションなしで）動かす
  assert.equal(provider.resumes.at(-1) ?? null, null);
});

test("子チャット: 文の頭に引用を入れて送ると、引用はそのまま指示に入り、名前は引用のあとの文から付ける", async () => {
  const ctx = setup({ features: ["childChats", "settings", "workplaceMove"] });
  const parentId = await finishedChat(ctx);
  const child = (await ctx.api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "> 選んだ文\n>\n> 2 行目\n\nここを直したい", quote: null, inherit: false } })).body;
  assert.equal(child.title, "ここを直したい");
  const user = (await eventsOf(ctx, child.id)).find((e) => e.type === "user");
  assert.equal(user?.type === "user" && user.data.text, "> 選んだ文\n>\n> 2 行目\n\nここを直したい");
  await untilIdle(ctx, child.id);
  // AI からは Kickoff のチャットが見えないので、自分と親チャットの名前と ID を指示に添える
  const parent = await chatOf(ctx, parentId);
  assert.ok(ctx.provider.lastTurnContext?.includes(`Kickoff のチャット ID: ${child.id}`));
  assert.ok(ctx.provider.lastTurnContext?.includes(`- 親チャット: 「${parent.title}」（Kickoff のチャット ID: ${parentId}、Claude Code のセッション ID: ${parent.session_id}）`));
  await ctx.api("POST /api/chats/:chatId/messages", { params: { chatId: parentId }, body: { text: "親の続き" } });
  await untilIdle(ctx, parentId);
  // 親チャットには、親の行はなく、子チャットの名前・ID・セッション ID を添える（「子チャットはどれ？」に答えられるように）
  const sent = await chatOf(ctx, child.id);
  assert.ok(!ctx.provider.lastTurnContext?.includes("- 親チャット: "));
  assert.ok(ctx.provider.lastTurnContext?.includes(`  - 子チャット「ここを直したい」（Kickoff のチャット ID: ${child.id}、Claude Code のセッション ID: ${sent.session_id}、状態: 終わった）`));
});

test("子チャット: 引き継がない・引き継げる会話がないときは、選んだ文と質問だけで始める", async () => {
  const ctx = setup({ features: ["childChats", "settings", "workplaceMove"] });
  const { api, provider } = ctx;
  const parentId = await finishedChat(ctx);
  const fresh = (await api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "質問", inherit: false } })).body;
  assert.equal(provider.forks.length, 0);
  const first = (await eventsOf(ctx, fresh.id))[0];
  assert.match(first.type === "notice" ? first.data.message : "", /引き継がずに/);
  await untilIdle(ctx, fresh.id);

  // まだ終わった作業のない親（作業中のまま）からは、引き継げないことを知らせて始める
  const release = provider.hold();
  const busyParent: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: ctx.project.id }, body: { text: "長い作業" } })).body.id;
  const child = (await api("POST /api/chats/:chatId/children", { params: { chatId: busyParent }, body: { text: "横で質問", inherit: true } })).body;
  const notice = (await eventsOf(ctx, child.id))[0];
  assert.match(notice.type === "notice" ? notice.data.message : "", /引き継げる会話がまだない/);
  release();
  await until(async () => !(await isBusy(ctx, busyParent)) && !(await isBusy(ctx, child.id)));
  // 引き継がないなら、文がないと 400
  assert.equal((await api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "", inherit: false } })).status, 400);
});

test("子チャット: 聞くことなしで会話を引き継ぐと、親の会話を写した子チャットを作るだけで動かさず、最初に送った文から名前を付ける", async () => {
  const ctx = setup({ features: ["childChats", "settings", "workplaceMove"] });
  const { call, api, provider } = ctx;
  const parentId = await finishedChat(ctx);
  const answer = (await eventsOf(ctx, parentId)).find((e) => e.type === "result")!;
  const created = await api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "", inherit: true, event_id: answer.id } });
  assert.equal(created.status, 201);
  const child = created.body;
  assert.equal(child.parent_chat_id, parentId);
  assert.equal(child.parent_event_id, answer.id);
  assert.equal(child.status, "completed");
  assert.equal(child.title, "");
  assert.equal(child.session_id, "fork-1");
  assert.equal((await isBusy(ctx, child.id)), false);
  // 引き継いだお知らせだけ（発言はない）。まだ動かしていない
  assert.deepEqual((await eventsOf(ctx, child.id)).map((e) => e.type), ["notice"]);
  assert.ok(!provider.resumes.includes("fork-1"));
  // 最初に送ると、写したセッションの続きから動き、その文が名前になる
  await api("POST /api/chats/:chatId/messages", { params: { chatId: child.id }, body: { text: "これはどういう意味？\n2 行目" } });
  await until(() => provider.resumes.includes("fork-1"));
  assert.equal((await chatOf(ctx, child.id)).title, "これはどういう意味？");
  await untilIdle(ctx, child.id);
  // 2 回目からは名前を変えない
  await api("POST /api/chats/:chatId/messages", { params: { chatId: child.id }, body: { text: "別の話" } });
  await untilIdle(ctx, child.id);
  assert.equal((await chatOf(ctx, child.id)).title, "これはどういう意味？");

  // まだ引き継げる会話のない親（作業中のまま）からは、聞くことなしでは開けない
  const release = provider.hold();
  const busyParent: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: ctx.project.id }, body: { text: "長い作業" } })).body.id;
  const refused = await call("POST", `/api/chats/${busyParent}/children`, { text: "", inherit: true });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /引き継げる会話がまだありません/);
  release();
  await untilIdle(ctx, busyParent);
});

test("子チャット: チャット欄から送るときは添付も渡せ（文が空でも添付があれば作れる）、指示に添付のパスが添えられる", async () => {
  const ctx = setup({ features: ["childChats", "settings", "workplaceMove"] });
  const { call, api, provider } = ctx;
  const parentId = await finishedChat(ctx);
  const file = (await call("POST", `/api/chats/${parentId}/transcript`)).body;
  const child = (await api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "", attachments: [file], inherit: false } })).body;
  await untilIdle(ctx, child.id);
  const user = (await eventsOf(ctx, child.id)).find((e) => e.type === "user");
  assert.deepEqual(user?.type === "user" ? user.data.attachments?.map((a) => a.id) : null, [file.id]);
  assert.match(provider.prompts.at(-1)!, /チャット履歴-.+\.md/);
});

test("子チャット: 親をアーカイブ・移動・削除すると、子孫（子・孫）も一緒に扱う", async () => {
  const ctx = setup({ features: ["childChats", "settings", "workplaceMove"] });
  const { api, store } = ctx;
  const parentId = await finishedChat(ctx);
  const child = (await api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "子", inherit: false } })).body;
  await untilIdle(ctx, child.id);
  const grandchild = (await api("POST /api/chats/:chatId/children", { params: { chatId: child.id }, body: { text: "孫", inherit: false } })).body;
  await untilIdle(ctx, grandchild.id);
  assert.deepEqual(store.chats.descendants(parentId).map((c) => c.id), [grandchild.id, child.id]);

  await api("PATCH /api/chats/:chatId", { params: { chatId: parentId }, body: { archived: true } });
  assert.ok((await chatOf(ctx, child.id)).archived_at && (await chatOf(ctx, grandchild.id)).archived_at);
  await api("PATCH /api/chats/:chatId", { params: { chatId: parentId }, body: { archived: false } });
  assert.equal((await chatOf(ctx, grandchild.id)).archived_at, null);
  // 子だけをしまっても親はそのまま。親をしまって戻しても、子だけでしまっていた子（とその下）はしまったまま
  await api("PATCH /api/chats/:chatId", { params: { chatId: child.id }, body: { archived: true } });
  assert.equal((await chatOf(ctx, parentId)).archived_at, null);
  await api("PATCH /api/chats/:chatId", { params: { chatId: parentId }, body: { archived: true } });
  await api("PATCH /api/chats/:chatId", { params: { chatId: parentId }, body: { archived: false } });
  assert.deepEqual((await Promise.all([parentId, child.id, grandchild.id].map((id) => chatOf(ctx, id)))).map((c) => c.archived_at !== null), [false, true, true]);
  await api("PATCH /api/chats/:chatId", { params: { chatId: child.id }, body: { archived: false } });

  const other = store.projects.create({ name: "別", repo_path: tempDir(), provider: "claude" });
  await api("POST /api/chats/:chatId/move", { params: { chatId: parentId }, body: { project_id: other.id } });
  assert.deepEqual((await Promise.all([child.id, grandchild.id].map((id) => chatOf(ctx, id)))).map((c) => c.project_id), [other.id, other.id]);

  // 削除は子孫ごとゴミ箱へ（ふだんの読み取りからは消える）
  assert.equal((await api("DELETE /api/chats/:chatId", { params: { chatId: parentId } })).status, 200);
  assert.deepEqual([parentId, child.id, grandchild.id].map((id) => store.chats.get(id)), [undefined, undefined, undefined]);
});

