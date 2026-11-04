// API のテスト: チャット（作成・変更・固定・アーカイブ・移動・削除）・グループ、送信待ち・実行（送る・伝える・止める・分岐・巻き戻し）、添付・承認依頼・プロバイダー・使用枠、/ のコマンド、自動のアーカイブ（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ApprovalCenter } from "../chat/approvals.js";
import { Bus } from "../bus.js";
import { Runner } from "../chat/runner.js";
import { AUTH, setup, until } from "../testing/testServer.js";
import { tempDir } from "../testing/tempDir.js";
import type { ChatLive } from "@shared/types";

test("未読: 作業中も AI の文章の返答で未読にし、一番下まで見た記録より新しい結果があれば既読にしない", async () => {
  const { call, project, store, runner, provider } = setup();
  // ツールの実行・サブエージェントの返答では未読にしない
  provider.emits = [
    { type: "tool_use", id: "t1", name: "Read", input: {} },
    { type: "text", text: "サブの返答", parent: "t1" },
  ];
  let release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "やって" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "running" && store.events.list(chatId).some((e) => e.type === "tool_use"));
  assert.equal(store.chats.get(chatId)?.unread, false);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal((await call("POST", `/api/chats/${chatId}/seen`)).body.unread, false);

  // 作業中に AI の文章の返答が届いたら未読（作業中のまま）
  provider.emits = [{ type: "text", text: "途中の返答" }];
  release = provider.hold();
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "続けて" })).status, 200);
  await until(() => store.chats.get(chatId)?.unread === true);
  assert.equal(store.chats.get(chatId)?.status, "running");
  const textId = store.events.list(chatId).findLast((e) => e.type === "text")!.id;
  // 一番下まで見た（その返答まで）: 既読
  assert.equal((await call("POST", `/api/chats/${chatId}/seen`, { event_id: textId })).body.unread, false);
  release();
  await until(() => !runner.isBusy(chatId));
  // 終わった: 未読。終わりの結果より前までしか見ていなければ未読のまま、終わりまで見たら既読
  assert.equal(store.chats.get(chatId)?.unread, true);
  assert.equal((await call("POST", `/api/chats/${chatId}/seen`, { event_id: textId })).body.unread, true);
  const lastId = store.events.list(chatId).at(-1)!.id;
  assert.equal((await call("POST", `/api/chats/${chatId}/seen`, { event_id: lastId })).body.unread, false);
  assert.equal((await call("POST", `/api/chats/${chatId}/seen`, { event_id: "x" })).status, 400);
});

test("裏で動いている作業: 作業中はチャットの詳細で返し、SSE の chat_live でも知らせ、作業が終わったら消す", async () => {
  const { call, project, runner, provider, bus } = setup();
  const seen: unknown[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live") seen.push(e.live.background);
  });
  const state = { tasks: [{ task_id: "b1", kind: "command" as const, description: "npm run dev" }], replied: true };
  provider.background = state;
  const release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "動かして" })).body.id;
  await until(() => runner.live(chatId).background !== null);
  assert.deepEqual((await call("GET", `/api/chats/${chatId}`)).body.live.background, state);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.background, null);
  assert.deepEqual(seen, [state, null]);
});

test("圧縮: 圧縮している間はチャットの詳細で始めた時刻を返し、SSE の chat_live でも知らせ、作業が終わったら消す", async () => {
  const { call, project, runner, provider, bus } = setup();
  const seen: (string | null)[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live") seen.push(e.live.compacting);
  });
  provider.compacting = true;
  const release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "続けて" })).body.id;
  await until(() => runner.live(chatId).compacting !== null);
  const since = (await call("GET", `/api/chats/${chatId}`)).body.live.compacting;
  assert.equal(typeof since, "string");
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.compacting, null);
  assert.deepEqual(seen, [since, null]);
});

test("作業中の様子: チャットの詳細の live と SSE の chat_live は同じ形で、どれかが変わったときだけ丸ごと届く", async () => {
  const { call, project, runner, provider, bus } = setup();
  const lives: ChatLive[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live") lives.push(JSON.parse(JSON.stringify(e.live)));
  });
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "次" });
  await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true });
  // 変わらなければ知らせない
  await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true });
  assert.equal(lives.length, 2);
  const last = lives.at(-1)!;
  assert.deepEqual((await call("GET", `/api/chats/${chatId}`)).body.live, last);
  assert.deepEqual(
    last.queue.messages.map((m) => m.text),
    ["次"],
  );
  assert.deepEqual(
    { ...last, queue: { ...last.queue, messages: [] } },
    { queue: { messages: [], paused: true, stops: [], waiting_edit: false }, background: null, retry: null, reconnect: null, compacting: null, stopping: false },
  );
  await call("DELETE", `/api/chats/${chatId}/queue`);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("再試行: AI の API への通信を再試行している間はチャットの詳細でも返し、作業が終わったら消す", async () => {
  const { call, project, runner, provider } = setup();
  const retry = { attempt: 2, max_retries: 10, retry_delay_ms: 4000, at: new Date().toISOString() };
  provider.retry = retry;
  const release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "動かして" })).body.id;
  await until(() => runner.live(chatId).retry !== null);
  assert.deepEqual((await call("GET", `/api/chats/${chatId}`)).body.live.retry, retry);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.retry, null);
});

test("停止: 止めるよう頼んでから作業が終わるまでは、詳細と SSE の chat_live で停止中を知らせる", async () => {
  const { call, project, runner, provider, bus } = setup();
  const seen: boolean[] = [];
  bus.subscribe((e) => {
    if (e.type === "chat_live") seen.push(e.live.stopping);
  });
  provider.hold();
  let finish = () => {};
  provider.slowStop = new Promise((resolve) => (finish = resolve));
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "動かして" })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.stopping, false);
  // 止めるよう頼んだだけで返すものはない（停止中は SSE の chat_live で届く）
  assert.deepEqual(await call("POST", `/api/chats/${chatId}/cancel`), { status: 204, body: undefined });
  // 2 回押しても知らせは 1 回
  await call("POST", `/api/chats/${chatId}/cancel`);
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.stopping, true);
  assert.equal(runner.isBusy(chatId), true);
  finish();
  await until(() => !runner.isBusy(chatId));
  const detail = (await call("GET", `/api/chats/${chatId}`)).body;
  assert.equal(detail.live.stopping, false);
  assert.equal(detail.chat.status, "cancelled");
  assert.deepEqual(seen, [true, false]);
});

test("チャットの一覧: 件数で黙って切らず、最後に動いた順に返す。?archived=1 はアーカイブ済みだけ", async () => {
  const { call, project, store } = setup();
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const ids: number[] = [];
  for (let i = 0; i < 305; i++) ids.push(store.chats.create({ project_id: i % 2 ? project.id : other.id, provider: "claude", title: `c${i}`, status: "completed" }).id);
  // いちばん古いチャットが動いた（状態が変わると、最後に動いた時刻が進んで並びの先頭へ）。アーカイブ済みは別に読む
  await new Promise((resolve) => setTimeout(resolve, 5));
  store.chats.update(ids[0], { status: "running" });
  store.chats.update(ids[1], { archived_at: new Date().toISOString() });

  const all = (await call("GET", "/api/chats")).body as { id: number }[];
  assert.equal(all.length, 304);
  assert.equal(all[0].id, ids[0]);
  assert.deepEqual((await call("GET", "/api/chats?archived=1")).body.map((r: { id: number }) => r.id), [ids[1]]);
  assert.equal((await call("GET", "/api/chats?limit=5")).body.length, 5);
  const mine = (await call("GET", `/api/projects/${project.id}/chats`)).body as { id: number; project_id: number }[];
  assert.equal(mine.length, 151);
  assert.ok(mine.every((r) => r.project_id === project.id));
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/chats?archived=1`)).body.map((r: { id: number }) => r.id), [ids[1]]);
  assert.equal((await call("GET", `/api/projects/${other.id}/chats?archived=1`)).body.length, 0);
});

test("チャット・グループの API", async () => {
  const { call, project, store, runner } = setup();
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const group = await call("POST", `/api/projects/${project.id}/groups`, { name: "g" });
  assert.equal(group.status, 201);
  // グループの色は、同じプロジェクトのほかのグループと被らない色を作ったときに選ぶ
  const second = (await call("POST", `/api/projects/${project.id}/groups`, { name: "g2" })).body;
  assert.equal(typeof group.body.hue, "number");
  assert.notEqual(second.hue, group.body.hue);
  await call("DELETE", `/api/groups/${second.id}`);
  const otherGroup = (await call("POST", `/api/projects/${other.id}/groups`, { name: "x" })).body;

  // 本文も添付もなければ送れない（本文のキーは続きと同じ text。以前の prompt は受け付けない）。ほかのプロジェクトのグループには入れられない
  assert.equal((await call("POST", `/api/projects/${project.id}/chats`, { phase: "requirements" })).status, 400);
  assert.equal((await call("POST", `/api/projects/${project.id}/chats`, { prompt: "以前のキー" })).status, 400);
  const cross = await call("POST", `/api/projects/${project.id}/chats`, { text: "x", group_id: otherGroup.id });
  assert.deepEqual(cross, { status: 400, body: { error: "ほかのプロジェクトのグループには入れられません" } });

  const started = await call("POST", `/api/projects/${project.id}/chats`, { text: "こんにちは", group_id: group.body.id });
  assert.equal(started.status, 201);
  const chatId: number = started.body.id;
  await until(() => !runner.isBusy(chatId));
  assert.equal(store.chats.get(chatId)?.group_id, group.body.id);

  assert.equal((await call("GET", `/api/projects/${project.id}/chats`)).body.length, 1);
  assert.equal((await call("GET", "/api/chats")).body.length, 1);
  const detail = await call("GET", `/api/chats/${chatId}`);
  assert.equal(detail.body.chat.id, chatId);
  assert.ok(detail.body.events.length > 0);
  assert.deepEqual(detail.body.approvals, []);
  assert.deepEqual(await call("GET", "/api/chats/999"), { status: 404, body: { error: "チャットが見つかりません" } });
  assert.ok(Array.isArray((await call("GET", `/api/search?q=${encodeURIComponent("こんにちは")}&project_id=${project.id}`)).body));
  // 絞り込み・件数が数でなければ 400（NaN を SQL に入れない）。件数の上限は 1000 に丸める
  assert.equal((await call("GET", "/api/search?q=a&project_id=x")).status, 400);
  assert.equal((await call("GET", "/api/search?q=a&limit=abc")).status, 400);
  assert.equal((await call("GET", "/api/search?q=a&chat_id=")).status, 200);
  assert.equal((await call("GET", "/api/chats?limit=abc")).status, 400);
  assert.equal((await call("GET", "/api/chats?limit=0")).status, 400);
  assert.equal((await call("GET", "/api/chats?limit=5000")).body.length, 1);
  assert.equal((await call("GET", "/api/chats?archived=yes")).status, 400);
  assert.equal((await call("GET", "/api/approvals?project_id=x")).status, 400);
  assert.deepEqual((await call("GET", `/api/approvals?project_id=${project.id}`)).body, []);

  // カンバンの列（stage）は AI の状態で決まるので、送っても受け付けず、返しもしない
  const renamed = await call("PATCH", `/api/chats/${chatId}`, { title: "名前", stage: "todo", group_id: null });
  assert.equal(renamed.body.title, "名前");
  assert.equal("stage" in renamed.body, false);
  assert.equal(renamed.body.group_id, null);
  assert.equal((await call("PATCH", `/api/chats/${chatId}`, { group_id: otherGroup.id })).status, 400);
  assert.equal((await call("PATCH", `/api/chats/${chatId}`, { group_id: group.body.id })).body.group_id, group.body.id);

  assert.equal((await call("POST", `/api/chats/${chatId}/seen`)).body.unread, false);
  // 未読にする・既読にする: 印だけを変え、最後に動いた時刻（並び順）は変えない
  const activeAt = store.chats.get(chatId)?.active_at;
  assert.equal((await call("POST", `/api/chats/${chatId}/unseen`)).body.unread, true);
  assert.equal(store.chats.get(chatId)?.active_at, activeAt);
  assert.equal((await call("POST", `/api/chats/${chatId}/seen`)).body.unread, false);
  assert.equal(store.chats.get(chatId)?.active_at, activeAt);
  // サイドバーの上に固定する・やめる（プロジェクトと同じく PATCH）: 並び順（最後に動いた時刻）は変えない
  assert.equal((await call("PATCH", `/api/chats/${chatId}`, { pinned: true })).body.pinned, true);
  assert.equal(store.chats.get(chatId)?.active_at, activeAt);
  assert.equal((await call("PATCH", `/api/chats/${chatId}`, { pinned: false })).body.pinned, false);
  assert.equal((await call("PATCH", `/api/chats/${chatId}`, { pinned: "yes" })).status, 400);
  // 以前の個別のルートはなくした
  assert.equal((await call("POST", `/api/chats/${chatId}/pin`, { pinned: true })).status, 404);
  assert.equal((await call("POST", `/api/chats/${chatId}/archive`, { archived: true })).status, 404);
  // アーカイブ・戻す（しまったままもう一度しまっても、しまった日時は変えない）。並び順は変えない
  const archived = (await call("PATCH", `/api/chats/${chatId}`, { archived: true })).body;
  assert.ok(archived.archived_at);
  assert.equal((await call("PATCH", `/api/chats/${chatId}`, { archived: true })).body.archived_at, archived.archived_at);
  assert.equal(store.chats.get(chatId)?.active_at, activeAt);
  // 一覧はアーカイブしていないものだけ、?archived=1 はアーカイブ済みだけ（全プロジェクト・プロジェクトごとで同じ）
  assert.equal((await call("GET", `/api/projects/${project.id}/chats`)).body.length, 0);
  assert.equal((await call("GET", `/api/projects/${project.id}/chats?archived=1`)).body.length, 1);
  assert.equal((await call("GET", "/api/chats")).body.length, 0);
  assert.equal((await call("GET", "/api/chats?archived=1")).body.length, 1);
  // いくつかの項目を一度に変えられる
  const restored = (await call("PATCH", `/api/chats/${chatId}`, { archived: false, pinned: true, title: "名前2" })).body;
  assert.deepEqual([restored.archived_at, restored.pinned, restored.title], [null, true, "名前2"]);
  await call("PATCH", `/api/chats/${chatId}`, { pinned: false });

  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, {})).status, 400);
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "続き" })).status, 200);
  await until(() => !runner.isBusy(chatId));
  assert.equal((await call("POST", `/api/chats/${chatId}/cancel`)).status, 204);

  assert.deepEqual(
    (await call("PUT", `/api/projects/${project.id}/groups/order`, { ids: [group.body.id] })).body.map((g: { id: number }) => g.id),
    [group.body.id],
  );
  assert.equal((await call("PATCH", `/api/groups/${group.body.id}`, { name: "h" })).body.name, "h");
  assert.equal((await call("GET", `/api/projects/${project.id}/groups`)).body.length, 1);
  assert.deepEqual(await call("DELETE", `/api/groups/${group.body.id}`), { status: 204, body: undefined });
  assert.equal(store.chats.get(chatId)?.group_id, null);
  assert.deepEqual(await call("PATCH", "/api/groups/999", { name: "x" }), { status: 404, body: { error: "グループが見つかりません" } });

  assert.deepEqual(await call("DELETE", `/api/chats/${chatId}`), { status: 204, body: undefined });
  assert.equal(store.chats.get(chatId), undefined);
});

test("作業中のチャットはアーカイブ・削除できない（409）。断るときはほかの項目も変えない", async () => {
  const { call, project, runner, provider, store } = setup();
  const release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  const busy = await call("PATCH", `/api/chats/${chatId}`, { archived: true, pinned: true });
  assert.deepEqual(busy, { status: 409, body: { error: "作業中のチャットはアーカイブできません。終わってから（または中断してから）行ってください" } });
  assert.equal(store.chats.get(chatId)?.pinned, false);
  assert.equal(store.chats.get(chatId)?.archived_at, null);
  assert.equal((await call("DELETE", `/api/chats/${chatId}`)).status, 409);
  // 固定は作業中でもできる
  assert.equal((await call("PATCH", `/api/chats/${chatId}`, { pinned: true })).body.pinned, true);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("チャットを別のプロジェクトへ移す: グループ・作業場所・ブランチを外し、並び順は変えない。作業中・知らないプロジェクトは断る", async () => {
  const { call, project, store, runner } = setup();
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const group = (await call("POST", `/api/projects/${project.id}/groups`, { name: "g" })).body;
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "こんにちは", group_id: group.id })).body.id;
  await until(() => !runner.isBusy(chatId));
  const activeAt = store.chats.get(chatId)?.active_at;

  assert.equal((await call("POST", `/api/chats/${chatId}/move`, { project_id: 999 })).status, 404);
  assert.equal((await call("POST", `/api/chats/${chatId}/move`, {})).status, 400);
  const moved = await call("POST", `/api/chats/${chatId}/move`, { project_id: other.id });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.project_id, other.id);
  assert.equal(moved.body.group_id, null);
  assert.equal(moved.body.worktree_path, null);
  assert.equal(moved.body.branch, null);
  assert.equal(moved.body.active_at, activeAt);
  assert.equal((await call("GET", `/api/projects/${project.id}/chats`)).body.length, 0);
  assert.equal((await call("GET", `/api/projects/${other.id}/chats`)).body.length, 1);
  // 同じプロジェクトへの移動はそのまま返す
  assert.equal((await call("POST", `/api/chats/${chatId}/move`, { project_id: other.id })).body.project_id, other.id);

  // 作業中は断る
  await call("POST", `/api/chats/${chatId}/messages`, { text: "続き" });
  if (runner.isBusy(chatId)) assert.equal((await call("POST", `/api/chats/${chatId}/move`, { project_id: project.id })).status, 409);
  await until(() => !runner.isBusy(chatId));
});

test("添付・承認依頼・プロバイダー・使用枠の API", async () => {
  const { app, call, approvals, project } = setup();
  assert.deepEqual(await call("POST", "/api/uploads"), { status: 400, body: { error: "ファイルがありません" } });
  const form = new FormData();
  form.append("file", new File(["hello"], "a.txt", { type: "text/plain" }));
  const uploaded = await app.request("/api/uploads", { method: "POST", headers: AUTH, body: form });
  assert.equal(uploaded.status, 201);
  const [saved] = (await uploaded.json()) as { id: string; name: string; mime: string; size: number }[];
  assert.equal(saved.name, "a.txt");
  // 画像と PDF 以外はダウンロードさせる
  const file = await app.request(`/api/uploads/${saved.id}?mime=text/plain`, { headers: AUTH });
  assert.equal(await file.text(), "hello");
  assert.equal(file.headers.get("content-type"), "application/octet-stream");
  assert.equal(file.headers.get("content-disposition"), "attachment; filename*=UTF-8''a.txt");
  assert.equal(file.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await call("GET", `/api/uploads/${randomUUID()}`), { status: 404, body: { error: "ファイルが見つかりません" } });

  assert.deepEqual((await call("GET", "/api/approvals")).body, []);
  // もう待っていない（回答済み・中断済み）依頼は 409（状態による失敗。404 にしない）
  assert.deepEqual(await call("POST", "/api/approvals/nope", { action: "allow" }), {
    status: 409,
    body: { error: "この依頼はすでに回答済みか、中断されています" },
  });
  assert.equal((await call("POST", "/api/approvals/nope", { action: "maybe" })).status, 400);

  // AI からの質問の「その他」に添えた添付は、回答の文にパスを書き添えて渡す（見つからない添付は書かない）
  const question = approvals.request(
    { chatId: 1, projectId: project.id },
    { kind: "question", toolName: "AskUserQuestion", input: { questions: [] }, canRemember: false },
    new AbortController().signal,
  );
  const answered = await call("POST", `/api/approvals/${question.approval.id}`, {
    action: "answer",
    answers: { Q: "この画像のように" },
    attachments: { Q: [saved, { id: randomUUID(), name: "missing.png", mime: "image/png", size: 1 }] },
  });
  // 回答した依頼は一覧から消えるので、返すものはない（204）
  assert.equal(answered.status, 204);
  const decision = await question.decision;
  assert.equal(decision.action, "answer");
  const text = decision.action === "answer" ? String(decision.answers.Q) : "";
  assert.match(text, /^この画像のように\n\n回答に添えた添付ファイル（回答の一部です。Read ツールで開いて中身を確かめてから進めてください）:\n- .+a\.txt（text\/plain, 5 B）$/);
  // チャットの記録には、選んだままの回答と添付を残す（AI に渡すのは上の、パスを書き添えた回答）
  assert.deepEqual(decision.action === "answer" ? decision.plain : undefined, { Q: "この画像のように" });
  assert.equal(decision.action === "answer" ? decision.attachments?.Q.length : 0, 2);

  assert.equal((await call("GET", "/api/providers")).body.length, 3);
  assert.deepEqual((await call("GET", "/api/providers/claude/models")).body, []);
  assert.equal((await call("GET", "/api/providers/unknown/models")).status, 400);
  assert.deepEqual((await call("GET", "/api/usage")).body, { available: false });
  assert.deepEqual((await call("POST", "/api/usage/refresh")).body, { available: false });
});

test("チャット欄の / のコマンド: プロジェクトの作業場所で調べる。プロジェクトがなければ 404", async () => {
  const { call, project, provider } = setup();
  provider.commandList = [{ name: "review", description: "コードを見直す", argument_hint: "" }];
  const res = await call("GET", `/api/projects/${project.id}/commands`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, provider.commandList);
  assert.equal(provider.lastCommandsCwd, project.repo_path);
  assert.equal((await call("GET", "/api/projects/999/commands")).status, 404);
});

test("自動のアーカイブ: 完了して日数がたったチャットだけをアーカイブする（未読・固定はしない）。設定で日数を選ぶ", async () => {
  const { call, project, store } = setup();
  const finish = async (prompt: string) => {
    const chat = (await call("POST", `/api/projects/${project.id}/chats`, { text: prompt })).body;
    await until(() => store.chats.get(chat.id)?.status === "completed");
    return chat.id as number;
  };
  const done = await finish("終わったもの");
  const pinned = await finish("固定したもの");
  const unread = await finish("まだ見ていないもの");
  store.chats.setUnread(done, false);
  store.chats.setUnread(pinned, false);
  store.chats.setPinned(pinned, true);
  store.chats.setUnread(unread, true);

  // まだ日数がたっていなければ、何もしない
  assert.equal(store.chats.archiveStale(7), 0);
  // 8 日後: 完了して確認済みのものだけ
  assert.equal(store.chats.archiveStale(7, new Date(Date.now() + 8 * 86_400_000)), 1);
  assert.ok(store.chats.get(done)?.archived_at);
  assert.equal(store.chats.get(pinned)?.archived_at, null);
  assert.equal(store.chats.get(unread)?.archived_at, null);

  // 設定（初めはしない。1〜365 日）
  assert.equal((await call("GET", "/api/settings")).body.auto_archive_days, null);
  assert.equal((await call("PUT", "/api/settings", { auto_archive_days: 0 })).status, 400);
  assert.equal((await call("PUT", "/api/settings", { auto_archive_days: 7 })).body.auto_archive_days, 7);
  assert.equal((await call("PUT", "/api/settings", { auto_archive_days: null })).body.auto_archive_days, null);
});

test("待ちの列の API: 作業中は列に入れ、並べ替え・消す・すぐ送る。作業中でなければすぐ送る", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue`, {})).status, 400);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue`, { text: "2" })).body.queued, true);
  const third = (await call("POST", `/api/chats/${chatId}/queue`, { text: "3" })).body;
  assert.equal(third.queued, true);
  assert.equal(typeof third.id, "string");
  // 応答は、入れたあとの送信待ち（入れた指示の ID を添える）
  assert.deepEqual(
    third.messages.map((m: { id: string; text: string }) => [m.text, m.id === third.id]),
    [
      ["2", false],
      ["3", true],
    ],
  );
  const queue = (await call("GET", `/api/chats/${chatId}`)).body.live.queue.messages as { id: string; text: string }[];
  assert.deepEqual(queue.map((m) => m.text), ["2", "3"]);

  const moved = await call("POST", `/api/chats/${chatId}/queue/${queue[1].id}/move`, { index: 0 });
  assert.deepEqual(moved.body.messages.map((m: { text: string }) => m.text), ["3", "2"]);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/nope/move`, { index: 0 })).status, 404);
  // 書き換え（空にはできない）
  const edited = await call("PATCH", `/api/chats/${chatId}/queue/${queue[1].id}`, { text: " 3 を直した " });
  assert.equal(edited.body.messages.find((m: { id: string }) => m.id === queue[1].id).text, "3 を直した");
  assert.equal((await call("PATCH", `/api/chats/${chatId}/queue/${queue[1].id}`, { text: "  " })).status, 400);
  assert.equal((await call("PATCH", `/api/chats/${chatId}/queue/nope`, { text: "x" })).status, 404);
  // 添付も置き換えられる（足す・外す）。添付があれば文は空にでき、文も添付もなくなるなら断る
  const image = { id: randomUUID(), name: "a.png", mime: "image/png", size: 10 };
  const withImage = await call("PATCH", `/api/chats/${chatId}/queue/${queue[1].id}`, { text: "", attachments: [image] });
  assert.deepEqual(withImage.body.messages.find((m: { id: string }) => m.id === queue[1].id).attachments, [image]);
  assert.equal((await call("PATCH", `/api/chats/${chatId}/queue/${queue[1].id}`, { text: "", attachments: [] })).status, 400);
  // 添付を省けば今のまま（文だけ直す）。外して元に戻す
  assert.deepEqual((await call("PATCH", `/api/chats/${chatId}/queue/${queue[1].id}`, { text: "3 を直した" })).body.messages[0].attachments, [image]);
  assert.deepEqual((await call("PATCH", `/api/chats/${chatId}/queue/${queue[1].id}`, { text: "3 を直した", attachments: [] })).body.messages[0].attachments, []);
  assert.deepEqual((await call("DELETE", `/api/chats/${chatId}/queue/${queue[0].id}`)).body, { messages: [{ ...moved.body.messages[0], text: "3 を直した" }], paused: false, stops: [], waiting_edit: false });
  assert.equal((await call("DELETE", `/api/chats/${chatId}/queue/nope`)).status, 404);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/nope/send`)).status, 404);

  // すぐ送る: 作業中なら止めずに伝える（作業は止めない）
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/queue/${queue[1].id}/send`)).body.messages, []);
  assert.deepEqual(provider.told, ["3 を直した"]);
  assert.deepEqual(runner.live(chatId).queue.messages, []);
  assert.equal(runner.isBusy(chatId), true);
  release();
  await until(() => !runner.isBusy(chatId));
  // 作業中でなければすぐ送る
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/queue`, { text: "4" })).body, { messages: [], paused: false, stops: [], waiting_edit: false, queued: false, id: null });
  await until(() => provider.prompts.length === 2);
  await until(() => !runner.isBusy(chatId));
  // hold: 作業していなくても送らずに、列の最後に足す（止めている送信待ちがあるときの「ためておく」）
  const held = (await call("POST", `/api/chats/${chatId}/queue`, { text: "5", hold: true })).body;
  assert.equal(held.queued, true);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["5"]);
  assert.equal(runner.isBusy(chatId), false);
  assert.equal(provider.prompts.length, 2);
});

test("待ちの列は再起動しても残る: 読み戻した列は止めておき、作業が終わっても送らない", async () => {
  const { call, project, runner, provider, store } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "2" });
  await call("POST", `/api/chats/${chatId}/queue`, { text: "3" });
  // アプリを終えて起動し直したことにして、同じデータベースで作り直す
  const restarted = new Runner({ store, approvals: new ApprovalCenter(new Bus()), providers: { claude: provider } as never, usage: {} as never });
  assert.deepEqual(restarted.live(chatId).queue.messages.map((m) => m.text), ["2", "3"]);
  assert.equal(restarted.live(chatId).queue.paused, true);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("待ちの列を止めておく API: 終わっても送らず、すぐ送るで 1 件ずつ送れ、戻すと先頭をすぐ送る。空になると自動に戻る", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  // 列が空なら止めない
  assert.deepEqual((await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true })).body, { messages: [], paused: false, stops: [], waiting_edit: false });
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/paused`, {})).status, 400);
  assert.equal((await call("PUT", "/api/chats/999/queue/paused", { paused: true })).status, 404);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "2" });
  await call("POST", `/api/chats/${chatId}/queue`, { text: "3" });
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true })).body.paused, true);
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.queue.paused, true);

  // 終わっても送らない
  release();
  await until(() => !runner.isBusy(chatId));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(provider.prompts.length, 1);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["2", "3"]);

  // すぐ送るで 1 件だけ送り、終わってもまた止まる
  const [first] = runner.live(chatId).queue.messages;
  await call("POST", `/api/chats/${chatId}/queue/${first.id}/send`);
  await until(() => provider.prompts.length === 2 && !runner.isBusy(chatId));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(provider.prompts.length, 2);
  assert.equal(runner.live(chatId).queue.paused, true);

  // 自動で送るに戻すと、作業中でなければ先頭をすぐ送り、列が空になったら止めない状態に戻る
  assert.deepEqual((await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: false })).body, { messages: [], paused: false, stops: [], waiting_edit: false });
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "3");
  assert.equal(runner.live(chatId).queue.paused, false);
});

test("待ちの列の書き直し: 次に送る指示を書き直している間は送らず、終わったら送る。ほかの指示の書き直し・知らせが途絶えたときは止めない", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  for (const text of ["2", "3"]) await call("POST", `/api/chats/${chatId}/queue`, { text });
  const [first] = runner.live(chatId).queue.messages;
  assert.equal((await call("PUT", "/api/chats/999/queue/editing", { ids: [] })).status, 404);
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/editing`, {})).status, 400);

  // 次に送る指示（先頭）を書き直している: 終わっても送らない
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/editing`, { ids: [first.id] })).status, 200);
  release();
  await until(() => !runner.isBusy(chatId));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(provider.prompts.length, 1);
  // 送信の準備ができて、書き直しが終わるのを待っている（画面の案内に使う）
  assert.equal((await call("GET", `/api/chats/${chatId}`)).body.live.queue.waiting_edit, true);

  // 書き直して保存し、欄を閉じた: 書き直した文をすぐ送る
  const release2 = provider.hold();
  await call("PATCH", `/api/chats/${chatId}/queue/${first.id}`, { text: "2'" });
  await call("PUT", `/api/chats/${chatId}/queue/editing`, { ids: [] });
  await until(() => provider.prompts.length === 2);
  assert.equal(provider.prompts[1], "2'");
  assert.equal(runner.live(chatId).queue.waiting_edit, false);

  // 先頭でない指示を書き直していても止めない（その指示は、先頭になってから書き直しが終わるのを待つ）
  await call("POST", `/api/chats/${chatId}/queue`, { text: "4" });
  await call("PUT", `/api/chats/${chatId}/queue/editing`, { ids: [runner.live(chatId).queue.messages[1].id] });
  release2();
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "3");

  // 知らせが途絶えた（画面を閉じた・落ちた）: 持ち時間で外れて送る
  await until(() => provider.prompts.length === 4);
  assert.equal(provider.prompts[3], "4");
});

test("待ちの列をまとめる API: 選んだ指示を送らずに 1 件にし（列の順に空行でつなぐ）、選んだうちのいちばん上の位置に残す", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  for (const text of ["a", "b", "c", "d"]) await call("POST", `/api/chats/${chatId}/queue`, { text });
  const ids = runner.live(chatId).queue.messages.map((m) => m.id);
  // 2 件以上選ばないとまとめない
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/merge`, { ids: [ids[0]] })).status, 400);
  assert.equal((await call("POST", "/api/chats/999/queue/merge", { ids })).status, 404);
  // 選んだ順ではなく、列の順につなぐ
  const merged = await call("POST", `/api/chats/${chatId}/queue/merge`, { ids: [ids[3], ids[1]] });
  assert.equal(merged.status, 200);
  assert.equal(merged.body.id, ids[1]);
  assert.deepEqual(
    runner.live(chatId).queue.messages.map((m) => m.text),
    ["a", "b\n\nd", "c"],
  );
  // 送ってはいない
  assert.equal(provider.prompts.length, 1);
  release();
});

test("待ちの列を 1 件ずつ順に送る API: まとめずに別々の発言として順に送り、止めておく・「ここまで」の印があっても最後まで送る", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  // 送るものがなければ 409（状態による失敗）、チャットがなければ 404
  assert.deepEqual(await call("POST", `/api/chats/${chatId}/queue/send-in-order`), { status: 409, body: { error: "送信待ちの指示がありません" } });
  assert.equal((await call("POST", "/api/chats/999/queue/send-in-order")).status, 404);
  for (const text of ["2", "3", "4"]) await call("POST", `/api/chats/${chatId}/queue`, { text });
  await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: true });
  await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [1] });
  release();
  await until(() => !runner.isBusy(chatId));

  assert.equal((await call("POST", `/api/chats/${chatId}/queue/send-in-order`)).status, 200);
  assert.equal(runner.live(chatId).queue.paused, false);
  assert.deepEqual(runner.live(chatId).queue.stops, []);
  await until(() => provider.prompts.length === 4 && runner.live(chatId).queue.messages.length === 0 && !runner.isBusy(chatId));
  // 1 つにまとめず、1 件ずつ別々の発言として送る
  assert.deepEqual(provider.prompts.slice(1), ["2", "3", "4"]);
});

test("「ここまで送ったら止めます」: 印は列の中の位置で持ち、いくつでも・1 件目の上にも置ける。印まで送って止め、自動に戻すと次の印まで送る", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  for (const text of ["2", "3", "4", "5"]) await call("POST", `/api/chats/${chatId}/queue`, { text });
  const [, third] = runner.live(chatId).queue.messages;
  // 列にない指示には付けられない
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/stop-after`, { id: "nope" })).status, 404);
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/stop-after`, {})).status, 400);
  // 「3」のあと（2 件目のあと）に付け、位置をまとめて置き換える（ドラッグ）こともできる
  assert.deepEqual((await call("PUT", `/api/chats/${chatId}/queue/stop-after`, { id: third.id })).body.stops, [2]);
  assert.deepEqual((await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [3, 2, 99] })).body.stops, [2, 3, 4]);
  assert.equal((await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [-1] })).status, 400);
  assert.deepEqual((await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [2, 3] })).body.stops, [2, 3]);
  assert.deepEqual((await call("GET", `/api/chats/${chatId}`)).body.live.queue.stops, [2, 3]);

  // 「3」まで送ったら、残りは送らずに止めておく（止まった印は「4」の上に残る）
  release();
  await until(() => provider.prompts.length === 3 && !runner.isBusy(chatId) && runner.live(chatId).queue.paused);
  assert.deepEqual(provider.prompts, ["1", "2", "3"]);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["4", "5"]);
  assert.deepEqual(runner.live(chatId).queue.stops, [0, 1]);

  // 自動で送るに戻すと、止まった印を越えて次の印（「4」のあと）まで送って、また止める
  await call("PUT", `/api/chats/${chatId}/queue/paused`, { paused: false });
  await until(() => provider.prompts.length === 4 && !runner.isBusy(chatId) && runner.live(chatId).queue.paused);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["5"]);
  assert.deepEqual(runner.live(chatId).queue.stops, [0]);

  // × で外す（位置の置き換え）
  assert.deepEqual((await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [] })).body.stops, []);
});

test("作業の終わり: 終わりの知らせがないまま止まったサブエージェントは、通信以外ならお知らせを残す", async () => {
  const { call, project, provider, store } = setup();
  provider.emits = [
    { type: "tool_use", id: "tu1", name: "Agent", input: { description: "調査" } },
    { type: "tool_result", tool_use_id: "tu1", content: "Async agent launched successfully.", is_error: false },
  ];
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  assert.ok(store.events.list(chatId).some((e) => e.type === "notice" && /サブエージェント 1 件（調査）/.test(JSON.stringify(e.data))));
  // 次の実行では、前の実行のものを数え直さない
  provider.emits = [];
  await call("POST", `/api/chats/${chatId}/messages`, { text: "次" });
  await until(() => store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  assert.equal(store.events.list(chatId).filter((e) => e.type === "notice" && /作業の終わりとともに/.test(JSON.stringify(e.data))).length, 1);
});

test("届かなかったサブエージェントの報告: 次に送る指示に本文を添えて渡し、自分の発言に印を残す（渡したら次からは添えない）", async () => {
  const { call, project, provider, store } = setup();
  // 裏で動かしたサブエージェントが報告を送ったが、親が動かないまま作業が終わった
  provider.emits = [
    { type: "tool_use", id: "tu1", name: "Agent", input: { description: "調査" } },
    { type: "tool_result", tool_use_id: "tu1", content: "Async agent launched successfully.\nagentId: a1", is_error: false },
    { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "調査", status: "running" },
    { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "", status: "completed", summary: "見つけたのは 3 件" },
  ];
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  provider.emits = [];
  await call("POST", `/api/chats/${chatId}/messages`, { text: "次" });
  await until(() => provider.prompts.length === 2);
  assert.ok(provider.prompts[1].startsWith("次\n"));
  assert.match(provider.prompts[1], /「調査」（ID: a1）の報告 ---\n見つけたのは 3 件/);
  const user = store.events.list(chatId).filter((e) => e.type === "user").at(-1)!;
  // 記録の自分の発言は、書いた文のまま（報告は印だけ）
  const { message_uuid: _id, ...userData } = user.data as { message_uuid?: string };
  assert.deepEqual(userData, { text: "次", handover: ["tu1"] });
  await until(() => store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  await call("POST", `/api/chats/${chatId}/messages`, { text: "その次" });
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "その次");
});

test("分岐の API: 作業の終わりの時点までの会話を新しいチャットに写す（元のチャットは変えない）", async () => {
  const { call, project, store, runner, provider } = setup();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => !runner.isBusy(chatId) && store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  const events = store.events.list(chatId);
  const first = events.find((e) => e.type === "result")!;
  assert.deepEqual([(first.data as { session_id?: string }).session_id, (first.data as { message_id?: string }).message_id], ["s1", "m1"]);

  const forked = await call("POST", `/api/chats/${chatId}/fork`, { event_id: first.id });
  assert.equal(forked.status, 201);
  assert.equal(forked.body.title, `${store.chats.get(chatId)!.title}（分岐）`);
  assert.equal(forked.body.session_id, "fork-1");
  assert.deepEqual(provider.forks, [["s1", "m1", project.repo_path]]);
  // 写した記録は時刻もそのまま、最後に分岐した知らせ
  const copied = store.events.list(forked.body.id);
  assert.deepEqual(copied.map((e) => e.type), ["user", "result", "notice"]);
  assert.equal(copied[0].created_at, events[0].created_at);
  assert.equal(store.events.list(chatId).length, events.length);

  // 分岐できない時点・見つからないチャット
  const user = events.find((e) => e.type === "user")!;
  assert.deepEqual(await call("POST", `/api/chats/${chatId}/fork`, { event_id: user.id }), { status: 400, body: { error: "この時点からは分岐できません" } });
  assert.equal((await call("POST", "/api/chats/999/fork", { event_id: first.id })).status, 404);
  // 作業中は分岐できない
  const release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "3" });
  assert.equal((await call("POST", `/api/chats/${chatId}/fork`, { event_id: first.id })).status, 409);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("巻き戻し・分岐は、止めた作業の終わりを起点にしない（その時点のメッセージはセッションに残らないことがある）", async () => {
  const { call, project, store, provider } = setup();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  const completed = store.events.list(chatId).find((e) => e.type === "result")!;
  // 以前の記録の形: 止めた作業の終わりにも message_id が付いている
  store.events.add(chatId, { type: "user", text: "2" , message_uuid: "u1" });
  const cancelled = store.events.add(chatId, { type: "result", status: "cancelled", session_id: "s9", message_id: "m9" });
  const third = store.events.add(chatId, { type: "user", text: "3" , message_uuid: "u2" });
  assert.equal((await call("POST", `/api/chats/${chatId}/fork`, { event_id: cancelled.id })).status, 400);
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: third.id, text: "3 を書き直し" })).status, 200);
  const data = completed.data as { session_id: string; message_id: string };
  assert.deepEqual(provider.forks.at(-1), [data.session_id, data.message_id, project.repo_path]);
});

test("巻き戻しの API: 自分の発言の手前まで戻し、書き直した文で送り直す（添付は引き継ぐ）", async () => {
  const { call, project, store, runner, provider } = setup();
  const attachment = { id: randomUUID(), name: "a.txt", mime: "text/plain", size: 1 };
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2", attachments: [attachment] });
  await until(() => !runner.isBusy(chatId) && store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  const before = store.events.list(chatId);
  const [firstUser, secondUser] = before.filter((e) => e.type === "user");
  const firstResult = before.find((e) => e.type === "result")!;

  // 2 回目の発言を巻き戻す: 1 回目の終わりの時点から分岐し、その後ろの記録を消して、書き直した文を送る
  const rewound = await call("POST", `/api/chats/${chatId}/rewind`, { event_id: secondUser.id, text: "2 を書き直し", options: { model: "m-x" } });
  assert.equal(rewound.status, 200);
  assert.equal(rewound.body.id, chatId);
  assert.equal(rewound.body.model, "m-x");
  assert.deepEqual(provider.forks, [["s1", "m1", project.repo_path]]);
  await until(() => !runner.isBusy(chatId) && provider.prompts.length === 3);
  assert.equal(provider.resumes[2], "fork-1");
  const after = store.events.list(chatId);
  assert.deepEqual(after.map((e) => e.type), ["user", "result", "notice", "user", "result"]);
  assert.deepEqual(after.slice(0, 2), before.slice(0, 2));
  assert.ok(after[2].id > firstResult.id && after[3].id > secondUser.id);
  const { message_uuid, ...rewrittenData } = after[3].data as { message_uuid?: string };
  assert.deepEqual(rewrittenData, { text: "2 を書き直し", attachments: [attachment] });
  // 発言には Claude Code に渡した ID を残す（ファイルを戻すときの目印）
  assert.equal(message_uuid, provider.promptIds[2]);
  // 消した発言は全文検索にも残らない
  assert.deepEqual(store.events.search("書き直し", { chatId }).map((h) => h.event_id), [after[3].id]);
  assert.deepEqual(store.events.search("2", { chatId }).map((h) => h.event_id), [after[3].id]);

  // 最初の発言を巻き戻す: 分岐せず、セッションを空にして最初から
  const forks = provider.forks.length;
  const resent = await call("POST", `/api/chats/${chatId}/rewind`, { event_id: firstUser.id, text: "やり直し" });
  assert.equal(resent.status, 200);
  assert.equal(resent.body.session_id, null);
  await until(() => !runner.isBusy(chatId) && provider.prompts.length === 4);
  assert.equal(provider.forks.length, forks);
  assert.equal(provider.resumes[3], null);
  assert.equal(provider.prompts[3], "やり直し");
  assert.deepEqual(store.events.list(chatId).map((e) => e.type), ["notice", "user", "result"]);

  // 自分の発言でない・ほかのチャットのイベント・見つからないチャットは断る
  const events = store.events.list(chatId);
  const result = events.find((e) => e.type === "result")!;
  const user = events.find((e) => e.type === "user")!;
  const notMine = await call("POST", `/api/chats/${chatId}/rewind`, { event_id: result.id, text: "x" });
  assert.deepEqual(notMine, { status: 400, body: { error: "自分の発言のところからだけ巻き戻せます" } });
  const otherId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "別" })).body.id;
  await until(() => !runner.isBusy(otherId));
  const otherUser = store.events.list(otherId).find((e) => e.type === "user")!;
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: otherUser.id, text: "x" })).status, 400);
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { text: "x" })).status, 400);
  assert.equal((await call("POST", "/api/chats/999/rewind", { event_id: user.id, text: "x" })).status, 404);
  // 文も添付もなければ送れない
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: user.id, text: "  " })).status, 400);

  // 作業中は断り、記録も待ちの列も変えない
  const release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "3" });
  await call("POST", `/api/chats/${chatId}/queue`, { text: "待ち" });
  const busyEvents = store.events.list(chatId).length;
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: user.id, text: "x" })).status, 409);
  assert.equal(store.events.list(chatId).length, busyEvents);
  assert.equal(runner.live(chatId).queue.messages.length, 1);
  release();
  await until(() => !runner.isBusy(chatId) && runner.live(chatId).queue.messages.length === 0);
  // ほかのチャットの記録は変わらない
  assert.deepEqual(store.events.list(otherId).map((e) => e.type), ["user", "result"]);
});

test("チャットの記録の API: ほかのチャットのやり取りを Markdown の添付ファイルにして返す（そのまま添付として送れる）", async () => {
  const { call, project, store, provider } = setup();
  const source = (await call("POST", `/api/projects/${project.id}/chats`, { text: "前の話" })).body.id;
  await until(() => store.chats.get(source)?.status === "completed");
  const res = await call("POST", `/api/chats/${source}/transcript`);
  assert.equal(res.status, 201);
  assert.equal(res.body.mime, "text/markdown");
  assert.match(res.body.name, /^チャット履歴-.+\.md$/);
  // 別のチャットに添付として送ると、指示に記録のファイルのパスが添えられる
  const target = (await call("POST", `/api/projects/${project.id}/chats`, { text: "続き", attachments: [res.body] })).body.id;
  await until(() => store.chats.get(target)?.status === "completed");
  assert.match(provider.prompts.at(-1)!, /チャット履歴-.+\.md/);
  assert.equal((await call("POST", "/api/chats/99999/transcript")).status, 404);
});

test("ファイルを戻す API: 自分の発言を送る前の状態にファイルだけ戻す（会話はそのまま）。dry_run は量だけ。戻せない・作業中は断る", async () => {
  const { call, project, store, runner, provider } = setup();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  const [user] = store.events.list(chatId).filter((e) => e.type === "user");
  const messageId = user.type === "user" ? user.data.message_uuid : "";
  assert.equal(messageId, provider.promptIds[0]);

  // 量だけを見る（戻さない・お知らせも残さない）
  const dry = await call("POST", `/api/chats/${chatId}/rewind-files`, { event_id: user.id, dry_run: true });
  assert.deepEqual(dry.body, provider.rewindResult);
  assert.deepEqual(provider.rewinds, [["s1", messageId, project.repo_path, true]]);
  const events = store.events.list(chatId).length;
  // 戻す: お知らせを残し、会話の記録は消さない
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind-files`, { event_id: user.id })).status, 200);
  // 本当に戻したときの結果には変わったファイルが付かないので、先に量を測ってから戻す
  assert.deepEqual(provider.rewinds.slice(1).map((r) => r[3]), [true, false]);
  const after = store.events.list(chatId);
  assert.equal(after.length, events + 1);
  assert.match(JSON.stringify(after.at(-1)!.data), /2 個のファイル: a\.ts、b\.ts/);

  // 戻せない（Claude Code が断った）・作業中
  provider.rewindResult = { can_rewind: false, error: "No file checkpoint found" };
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind-files`, { event_id: user.id, dry_run: true })).status, 400);
  provider.rewindResult = { can_rewind: true, files_changed: [] };
  const release = provider.hold();
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => runner.isBusy(chatId));
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind-files`, { event_id: user.id })).status, 409);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("巻き戻しの API: restore_files なら、分岐する前にファイルも戻す（ファイルの記録は元のセッションにあるため）", async () => {
  const { call, project, store, runner, provider } = setup();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => store.chats.get(chatId)?.status === "completed");
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => !runner.isBusy(chatId) && store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  const second = store.events.list(chatId).filter((e) => e.type === "user")[1];
  const messageId = (second.data as { message_uuid: string }).message_uuid;
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: second.id, text: "2'", restore_files: true })).status, 200);
  // 元のセッション（s1）で（量を測って）戻してから、分岐する
  assert.deepEqual(provider.rewinds, [
    ["s1", messageId, project.repo_path, true],
    ["s1", messageId, project.repo_path, false],
  ]);
  assert.equal(provider.forks.length, 1);
  await until(() => !runner.isBusy(chatId) && provider.prompts.length === 3);
  assert.ok(store.events.list(chatId).some((e) => e.type === "notice" && /ファイルもこの発言を送る前の状態に戻しました/.test(JSON.stringify(e.data))));
  // 戻せなければ、何も消さずに 400
  provider.rewindResult = { can_rewind: false };
  const count = store.events.list(chatId).length;
  const third = store.events.list(chatId).filter((e) => e.type === "user")[1];
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: third.id, text: "x", restore_files: true })).status, 400);
  assert.equal(store.events.list(chatId).length, count);
});

test("巻き戻しの API: 分岐に対応していないプロバイダーなら 400（最初の発言なら分岐しないので送れる）", async () => {
  const { call, project, store, runner, provider } = setup();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => !runner.isBusy(chatId));
  await call("POST", `/api/chats/${chatId}/messages`, { text: "2" });
  await until(() => !runner.isBusy(chatId) && store.events.list(chatId).filter((e) => e.type === "result").length === 2);
  const [firstUser, secondUser] = store.events.list(chatId).filter((e) => e.type === "user");
  Object.assign(provider, { fork: undefined });
  const res = await call("POST", `/api/chats/${chatId}/rewind`, { event_id: secondUser.id, text: "x" });
  assert.deepEqual(res, { status: 400, body: { error: "Fake は巻き戻しに対応していません" } });
  assert.equal(store.events.list(chatId).length, 4);
  assert.equal((await call("POST", `/api/chats/${chatId}/rewind`, { event_id: firstUser.id, text: "y" })).status, 200);
  await until(() => !runner.isBusy(chatId));
});

test("既定の推論の深さの API: 作業フォルダの Claude Code の設定から求める", async () => {
  const { call, project } = setup();
  fs.mkdirSync(path.join(project.repo_path, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(project.repo_path, ".claude", "settings.local.json"), JSON.stringify({ modelSettings: { "claude-opus-5": { effortLevel: "high" } } }));
  const body = (await call("GET", `/api/projects/${project.id}/effort-default?model=claude-opus-5`)).body;
  // 環境変数で決めている環境では、そちらが先になる
  if (!process.env.CLAUDE_CODE_EFFORT_LEVEL) assert.deepEqual(body, { effort: "high", source: "local" });
  assert.equal((await call("GET", "/api/projects/999/effort-default")).status, 404);
});

test("待ちの列の API: すべて消す・まとめて送る（文は空行でつなぎ、添付も合わせる。作業中なら止めずに伝える）", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  // 送るものがなければ 409（状態による失敗）
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/send-all`)).status, 409);
  // すべて消す
  await call("POST", `/api/chats/${chatId}/queue`, { text: "消す" });
  assert.deepEqual((await call("DELETE", `/api/chats/${chatId}/queue`)).body, { messages: [], paused: false, stops: [], waiting_edit: false });
  assert.deepEqual((await call("DELETE", `/api/chats/${chatId}/queue`)).body.messages, []);
  await call("POST", `/api/chats/${chatId}/queue`, { text: "A" });
  await call("POST", `/api/chats/${chatId}/queue`, { text: "B" });
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/queue/send-all`)).body.messages, []);
  assert.deepEqual(provider.told, ["A\n\nB"]);
  assert.deepEqual(runner.live(chatId).queue.messages, []);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("待ちの列の API: 選んだものだけ、まとめて送る・消す・いちばん上か下へ移す（ほかは並びを保つ）", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  const ids: string[] = [];
  for (const text of ["A", "B", "C", "D", "E"]) ids.push((await call("POST", `/api/chats/${chatId}/queue`, { text })).body.id);
  const texts = () => runner.live(chatId).queue.messages.map((m) => m.text);
  // B と D をいちばん上へ、C をいちばん下へ
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[3], ids[1]], to: "top" })).status, 200);
  assert.deepEqual(texts(), ["B", "D", "A", "C", "E"]);
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[2]], to: "bottom" });
  assert.deepEqual(texts(), ["B", "D", "A", "E", "C"]);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[0]], to: "middle" })).status, 400);
  // ドラッグで落とした位置へまとめて移す: B と A を E の前へ（並びは列の順のまま）、null ならいちばん下
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[0], ids[1]], before: ids[4] });
  assert.deepEqual(texts(), ["D", "B", "A", "E", "C"]);
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[3]], before: null });
  assert.deepEqual(texts(), ["B", "A", "E", "C", "D"]);
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[3], ids[2]], before: ids[1] });
  assert.deepEqual(texts(), ["C", "D", "B", "A", "E"]);
  // to と before の両方・どちらもなしは 400
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[0]], to: "top", before: null })).status, 400);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[0]] })).status, 400);
  // 元の並び（B D A E C）に戻す
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[2]], to: "bottom" });
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[1]], to: "top" });
  assert.deepEqual(texts(), ["B", "D", "A", "E", "C"]);
  // 止める線のある位置へ落とす: below_stop: false なら線の上（B D | A E C の C を A の前・線の上へ → B D C | A E）。ほかの指示は線の同じ側に残る
  await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [2] });
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[2]], before: ids[0], below_stop: false });
  assert.deepEqual(texts(), ["B", "D", "C", "A", "E"]);
  assert.deepEqual(runner.live(chatId).queue.stops, [3]);
  // いちばん上へ移しても、線の上の B・D は線の上のまま（E が線を越えて上へ）
  await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[4]], to: "top" });
  assert.deepEqual(texts(), ["E", "B", "D", "C", "A"]);
  assert.deepEqual(runner.live(chatId).queue.stops, [4]);
  // 元に戻す（線を外し、B D A E C に）
  await call("PUT", `/api/chats/${chatId}/queue/stops`, { stops: [] });
  for (const i of [1, 3, 0, 4, 2]) await call("POST", `/api/chats/${chatId}/queue/move-many`, { ids: [ids[i]], to: "bottom" });
  assert.deepEqual(texts(), ["B", "D", "A", "E", "C"]);
  // A と E を消す
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/queue/remove-many`, { ids: [ids[0], ids[4], "nai"] })).body.messages.map((m: { text: string }) => m.text), ["B", "D", "C"]);
  assert.deepEqual(texts(), ["B", "D", "C"]);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/remove-many`, { ids: [] })).status, 400);
  // C と B だけをまとめて送る（列の順につなぐ）。D は残る
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/queue/send-all`, { ids: [ids[2], ids[1]] })).body.messages.map((m: { text: string }) => m.text), ["D"]);
  assert.deepEqual(provider.told, ["B\n\nC"]);
  assert.deepEqual(texts(), ["D"]);
  assert.equal((await call("POST", `/api/chats/${chatId}/queue/send-all`, { ids: ["nai"] })).status, 404);
  // 残った D が止めたあとに送られないよう、列を空にしてから止める
  await call("DELETE", `/api/chats/${chatId}/queue`);
  runner.cancel(chatId);
  await until(() => !runner.isBusy(chatId));
  release();
});

test("止めずに伝える API: 作業中なら止めずに足して自分の発言に残し、足せなければ待ちの列へ。作業中でなければすぐ送る", async () => {
  const { call, project, runner, provider, store } = setup();
  const release = provider.hold();
  const chatId = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  // 作業中: 止めずに足す（待ちの列には入れない。作業も止めない）
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "ついでに" })).body, { result: "told" });
  assert.deepEqual(provider.told, ["ついでに"]);
  assert.deepEqual(runner.live(chatId).queue.messages, []);
  assert.equal(runner.isBusy(chatId), true);
  assert.equal((store.events.list(chatId).findLast((e) => e.type === "user")?.data as { text?: string }).text, "ついでに");
  assert.equal((await call("POST", `/api/chats/${chatId}/tell`, {})).status, 400);
  // 足せない（入力が閉じている）ときは待ちの列へ。行の「すぐ送る」で伝え直すときは先頭に戻す
  provider.acceptTell = false;
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "あとで" })).body, { result: "queued" });
  await call("POST", `/api/chats/${chatId}/queue`, { text: "2 番目" });
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["あとで", "2 番目"]);
  await call("POST", `/api/chats/${chatId}/queue/${runner.live(chatId).queue.messages[1].id}/send`);
  assert.deepEqual(runner.live(chatId).queue.messages.map((m) => m.text), ["2 番目", "あとで"]);
  provider.acceptTell = true;
  await call("POST", `/api/chats/${chatId}/queue/${runner.live(chatId).queue.messages[1].id}/send`);
  assert.deepEqual(provider.told, ["ついでに", "あとで"]);
  // 裏の作業を 1 つ止める
  assert.equal((await call("POST", `/api/chats/${chatId}/background/b1/stop`)).status, 204);
  assert.deepEqual(provider.stoppedTasks, ["b1"]);
  await call("DELETE", `/api/chats/${chatId}/queue`);
  release();
  await until(() => !runner.isBusy(chatId));
  // 作業中でなければ 409（状態による失敗）
  assert.equal((await call("POST", `/api/chats/${chatId}/background/b1/stop`)).status, 409);
  // 作業中でなければ、すぐ送る
  assert.deepEqual((await call("POST", `/api/chats/${chatId}/tell`, { text: "ふつう" })).body, { result: "sent" });
  await until(() => provider.prompts.length === 2);
  assert.equal(provider.prompts[1], "ふつう");
});
