// API のテスト: 子チャット（作る・親の会話を引き継ぐ / 引き継がない・子孫ごとのアーカイブ・移動・削除。共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
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
  // AI からは Kickoff のチャットが見えないので、自分と親チャットの名前と ID を指示に添える
  const parent = ctx.store.chats.get(parentId)!;
  assert.ok(ctx.provider.lastTurnContext?.includes(`Kickoff のチャット ID: ${child.id}`));
  assert.ok(ctx.provider.lastTurnContext?.includes(`- 親チャット: 「${parent.title}」（Kickoff のチャット ID: ${parentId}、Claude Code のセッション ID: ${parent.session_id}）`));
  await ctx.call("POST", `/api/chats/${parentId}/messages`, { text: "親の続き" });
  await until(() => !ctx.runner.isBusy(parentId));
  // 親チャットには、親の行はなく、子チャットの名前・ID・セッション ID を添える（「子チャットはどれ？」に答えられるように）
  const sent = ctx.store.chats.get(child.id)!;
  assert.ok(!ctx.provider.lastTurnContext?.includes("- 親チャット: "));
  assert.ok(ctx.provider.lastTurnContext?.includes(`  - 子チャット「ここを直したい」（Kickoff のチャット ID: ${child.id}、Claude Code のセッション ID: ${sent.session_id}、状態: 終わった）`));
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
  // 引き継がないなら、文がないと 400
  assert.equal((await call("POST", `/api/chats/${parentId}/children`, { text: "", inherit: false })).status, 400);
});

test("子チャット: 聞くことなしで会話を引き継ぐと、親の会話を写した子チャットを作るだけで動かさず、最初に送った文から名前を付ける", async () => {
  const ctx = setup();
  const { call, store, provider, runner } = ctx;
  const parentId = await finishedChat(ctx);
  const answer = store.events.list(parentId).find((e) => e.type === "result")!;
  const created = await call("POST", `/api/chats/${parentId}/children`, { text: "", inherit: true, event_id: answer.id });
  assert.equal(created.status, 201);
  const child = created.body;
  assert.equal(child.parent_chat_id, parentId);
  assert.equal(child.parent_event_id, answer.id);
  assert.equal(child.status, "completed");
  assert.equal(child.title, "");
  assert.equal(child.session_id, "fork-1");
  assert.equal(runner.isBusy(child.id), false);
  // 引き継いだお知らせだけ（発言はない）。まだ動かしていない
  assert.deepEqual(store.events.list(child.id).map((e) => e.type), ["notice"]);
  assert.ok(!provider.resumes.includes("fork-1"));
  // 最初に送ると、写したセッションの続きから動き、その文が名前になる
  await call("POST", `/api/chats/${child.id}/messages`, { text: "これはどういう意味？\n2 行目" });
  await until(() => provider.resumes.includes("fork-1"));
  assert.equal(store.chats.get(child.id)?.title, "これはどういう意味？");
  await until(() => !runner.isBusy(child.id));
  // 2 回目からは名前を変えない
  await call("POST", `/api/chats/${child.id}/messages`, { text: "別の話" });
  await until(() => !runner.isBusy(child.id));
  assert.equal(store.chats.get(child.id)?.title, "これはどういう意味？");

  // まだ引き継げる会話のない親（作業中のまま）からは、聞くことなしでは開けない
  const release = provider.hold();
  const busyParent: number = (await call("POST", `/api/projects/${ctx.project.id}/chats`, { text: "長い作業" })).body.id;
  const refused = await call("POST", `/api/chats/${busyParent}/children`, { text: "", inherit: true });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /引き継げる会話がまだありません/);
  release();
  await until(() => !runner.isBusy(busyParent));
});

test("子チャット: チャット欄から送るときは添付も渡せ（文が空でも添付があれば作れる）、指示に添付のパスが添えられる", async () => {
  const ctx = setup();
  const { call, store, provider } = ctx;
  const parentId = await finishedChat(ctx);
  const file = (await call("POST", `/api/chats/${parentId}/transcript`)).body;
  const child = (await call("POST", `/api/chats/${parentId}/children`, { text: "", attachments: [file], inherit: false })).body;
  await until(() => !ctx.runner.isBusy(child.id));
  const user = store.events.list(child.id).find((e) => e.type === "user");
  assert.deepEqual(user?.type === "user" ? user.data.attachments?.map((a) => a.id) : null, [file.id]);
  assert.match(provider.prompts.at(-1)!, /チャット履歴-.+\.md/);
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
  // 子だけをしまっても親はそのまま。親をしまって戻しても、子だけでしまっていた子（とその下）はしまったまま
  await call("PATCH", `/api/chats/${child.id}`, { archived: true });
  assert.equal(store.chats.get(parentId)!.archived_at, null);
  await call("PATCH", `/api/chats/${parentId}`, { archived: true });
  await call("PATCH", `/api/chats/${parentId}`, { archived: false });
  assert.deepEqual([parentId, child.id, grandchild.id].map((id) => store.chats.get(id)!.archived_at !== null), [false, true, true]);
  await call("PATCH", `/api/chats/${child.id}`, { archived: false });

  const other = store.projects.create({ name: "別", repo_path: tempDir(), provider: "claude" });
  await call("POST", `/api/chats/${parentId}/move`, { project_id: other.id });
  assert.deepEqual([child.id, grandchild.id].map((id) => store.chats.get(id)!.project_id), [other.id, other.id]);

  assert.equal((await call("DELETE", `/api/chats/${parentId}`)).status, 204);
  assert.deepEqual([parentId, child.id, grandchild.id].map((id) => store.chats.get(id)), [undefined, undefined, undefined]);
});

/** 裏で動かしたサブエージェント（ID a1・依頼つき・報告済み）がいる、終わったチャットを作る */
async function chatWithSubagent(ctx: ReturnType<typeof setup>) {
  ctx.provider.emits = [
    { type: "tool_use", id: "tu1", name: "Agent", input: { description: "調査", prompt: "src の構成を調べて", subagent_type: "Explore" } },
    { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "調査", status: "running" },
    { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "", status: "completed", summary: "見つけたのは 3 件" },
    { type: "tool_result", tool_use_id: "tu1", content: "見つけたのは 3 件", is_error: false },
  ];
  const id = await finishedChat(ctx);
  ctx.provider.emits = [];
  return id;
}

/** 子チャットの最初の発言と、添付したサブエージェントの記録の中身 */
async function firstMessage(ctx: ReturnType<typeof setup>, childId: number) {
  const user = ctx.store.events.list(childId).find((e) => e.type === "user");
  assert.ok(user?.type === "user");
  const file = await ctx.uploads.resolve(user.data.attachments![0].id);
  return { text: user.data.text, attachments: user.data.attachments!, markdown: fs.readFileSync(file!.path, "utf8") };
}

test("サブエージェントに子チャットで聞く: 会話の記録を Claude Code から読んで添付にし、起動した呼び出しから子チャットを始める（会話は引き継がない）", async () => {
  const ctx = setup();
  const parentId = await chatWithSubagent(ctx);
  ctx.provider.subagentLogs.a1 = [
    { kind: "user", text: "src の構成を調べて" },
    { kind: "assistant", text: "見ていきます。" },
    { kind: "tool", name: "Bash", input: { command: "ls src" }, result: "core\nrenderer", isError: false },
    { kind: "user", text: "テストも見て" },
  ];
  const created = await ctx.call("POST", `/api/chats/${parentId}/subagents/a1/children`, { text: "core には何がある？" });
  assert.equal(created.status, 201);
  const child = created.body;
  const call = ctx.store.events.list(parentId).find((e) => e.type === "tool_use" && e.data.id === "tu1")!;
  assert.equal(child.parent_chat_id, parentId);
  assert.equal(child.parent_event_id, call.id);
  assert.equal(child.title, "core には何がある？");
  assert.deepEqual(ctx.provider.subagentLogCalls, [["s1", "a1", ctx.project.repo_path]]);
  assert.deepEqual(ctx.provider.forks, []);
  const { text, attachments, markdown } = await firstMessage(ctx, child.id);
  assert.equal(attachments[0].name, "サブエージェントの記録-調査.md");
  assert.ok(text.startsWith("【サブエージェントについて聞く】「調査」（ID: a1）"));
  assert.ok(text.endsWith("\n---\ncore には何がある？"));
  for (const part of ["## 依頼（メインエージェントから）\n\nsrc の構成を調べて", "## サブエージェント\n\n見ていきます。", "### ツール Bash", "ls src", "core\nrenderer", "## 追加の指示（メインエージェントから）\n\nテストも見て", "## 親への報告\n\n見つけたのは 3 件", "種類 Explore"]) {
    assert.ok(markdown.includes(part), part);
  }
  const notice = ctx.store.events.list(child.id).find((e) => e.type === "notice");
  assert.ok(notice?.type === "notice" && notice.data.message.includes("会話の記録を添えて始めました"));
  await until(() => !ctx.runner.isBusy(child.id));
  assert.equal(ctx.provider.resumes.at(-1), null);
});

test("サブエージェントに子チャットで聞く: Claude Code から記録が読めなければ Kickoff に残っている分（依頼・報告）を添える。知らないサブエージェントは 400", async () => {
  const ctx = setup();
  const parentId = await chatWithSubagent(ctx);
  const child = (await ctx.call("POST", `/api/chats/${parentId}/subagents/a1/children`, { text: "どうだった？" })).body;
  const { markdown } = await firstMessage(ctx, child.id);
  assert.ok(markdown.includes("## 依頼（メインエージェントから）\n\nsrc の構成を調べて"));
  assert.ok(markdown.includes("## 親への報告\n\n見つけたのは 3 件"));
  const notice = ctx.store.events.list(child.id).find((e) => e.type === "notice");
  assert.ok(notice?.type === "notice" && notice.data.message.includes("読めなかったので"));
  await until(() => !ctx.runner.isBusy(child.id));
  assert.equal((await ctx.call("POST", `/api/chats/${parentId}/subagents/zz/children`, { text: "?" })).status, 400);
  assert.equal((await ctx.call("POST", `/api/chats/${parentId}/subagents/a1/children`, { text: "" })).status, 400);
});

/** 依頼文を返して終わった子チャットを作る（最後の返答は「依頼文の本文」。途中の「確認します」は最後の返答ではない） */
async function childWithReply(ctx: ReturnType<typeof setup>, parentId: number) {
  ctx.provider.emits = [
    { type: "text", text: "確認します" },
    { type: "tool_use", id: "r1", name: "Read", input: { file_path: "a.ts" } },
    { type: "tool_result", tool_use_id: "r1", content: "…", is_error: false },
    { type: "text", text: "子チャット「依頼」で検討した結果、次をお願いします。" },
  ];
  const child = (await ctx.call("POST", `/api/chats/${parentId}/children`, { text: "依頼", inherit: false })).body;
  await until(() => ctx.store.chats.get(child.id)?.status === "completed");
  ctx.provider.emits = [];
  const end = ctx.store.events.list(child.id).find((e) => e.type === "result")!;
  return { child, end };
}

test("親チャットに渡す: 作業の最後の返答を、引用・見出しなしで親に送る・送信待ちに足す・入力欄用に返し、親の発言には出どころ、子には渡した記録を残す", async () => {
  const ctx = setup();
  const { call, store, runner } = ctx;
  const parentId = await finishedChat(ctx);
  const { child, end } = await childWithReply(ctx, parentId);
  const reply = "子チャット「依頼」で検討した結果、次をお願いします。";
  const from = { chat_id: child.id, title: child.title };

  // 入力欄: 親には何も送らず、渡す文を返す
  const composer = await call("POST", `/api/chats/${child.id}/handoff`, { via: "composer", turn_event_id: end.id });
  assert.equal(composer.status, 200);
  assert.deepEqual(composer.body, { text: reply, parent_chat_id: parentId, sent: null });

  // 今すぐ送る: 親が作業していなければそのまま送り、発言に出どころ
  const sent = await call("POST", `/api/chats/${child.id}/handoff`, { via: "send", turn_event_id: end.id });
  assert.equal(sent.body.sent, "sent");
  const user = store.events.list(parentId).findLast((e) => e.type === "user");
  assert.ok(user?.type === "user");
  assert.equal(user.data.text, reply);
  assert.deepEqual(user.data.handoff_from, from);
  await until(() => !runner.isBusy(parentId));

  // 送信待ち: 作業していなくても送らずに列の最後へ（出どころ付き）
  const queued = await call("POST", `/api/chats/${child.id}/handoff`, { via: "queue", turn_event_id: end.id });
  assert.equal(queued.body.sent, "queued");
  const message = runner.queueState(parentId).messages.at(-1);
  assert.equal(message?.text, reply);
  assert.deepEqual(message?.handoff_from, from);
  assert.equal(runner.isBusy(parentId), false);

  // 子には、渡すたびに渡し方の記録
  const handoffs = store.events.list(child.id).flatMap((e) => (e.type === "handoff" ? [e.data.via] : []));
  assert.deepEqual(handoffs, ["composer", "send", "queue"]);
});

test("親チャットに渡す: 親のないチャット・作業の終わりでない記録・止めた作業は 400、親がアーカイブ済みなら 409", async () => {
  const ctx = setup();
  const { call, store } = ctx;
  const parentId = await finishedChat(ctx);
  const { child, end } = await childWithReply(ctx, parentId);
  const parentEnd = store.events.list(parentId).find((e) => e.type === "result")!;
  assert.equal((await call("POST", `/api/chats/${parentId}/handoff`, { via: "send", turn_event_id: parentEnd.id })).status, 400);
  const user = store.events.list(child.id).find((e) => e.type === "user")!;
  assert.equal((await call("POST", `/api/chats/${child.id}/handoff`, { via: "send", turn_event_id: user.id })).status, 400);
  const cancelled = store.events.add(child.id, { type: "result", status: "cancelled" });
  assert.equal((await call("POST", `/api/chats/${child.id}/handoff`, { via: "send", turn_event_id: cancelled.id })).status, 400);
  assert.equal((await call("POST", `/api/chats/${child.id}/handoff`, { via: "elsewhere", turn_event_id: end.id })).status, 400);
  store.chats.archive(parentId, true);
  assert.equal((await call("POST", `/api/chats/${child.id}/handoff`, { via: "send", turn_event_id: end.id })).status, 409);
  // 渡せなかったものは記録しない
  assert.equal(store.events.list(child.id).filter((e) => e.type === "handoff").length, 0);
});
