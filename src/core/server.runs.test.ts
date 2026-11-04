// API のテスト: チャット・グループ、添付・承認依頼・プロバイダー・使用枠、/ のコマンド、自動のアーカイブ（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ApprovalCenter } from "./approvals.js";
import { Bus } from "./bus.js";
import { Runner } from "./runner.js";
import { MAX_AUTO_RESUMES, RESUME_PROMPT } from "./runReconnect.js";
import { USAGE_RESUME_PROMPT } from "./runUsageLimit.js";
import { AUTH, setup, tempDir, until } from "./testing/testServer.js";

test("未読: 作業中も AI の文章の返答で未読にし、一番下まで見た記録より新しい結果があれば既読にしない", async () => {
  const { call, project, store, runner, provider } = setup();
  // ツールの実行・サブエージェントの返答では未読にしない
  provider.emits = [
    { type: "tool_use", id: "t1", name: "Read", input: {} },
    { type: "text", text: "サブの返答", sub: true },
  ];
  let release = provider.hold();
  const runId: number = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "やって" })).body.id;
  await until(() => store.getRun(runId)?.status === "running" && store.listEvents(runId).some((e) => e.type === "tool_use"));
  assert.equal(store.getRun(runId)?.attention, false);
  release();
  await until(() => !runner.isBusy(runId));
  assert.equal((await call("POST", `/api/runs/${runId}/seen`)).body.attention, false);

  // 作業中に AI の文章の返答が届いたら未読（作業中のまま）
  provider.emits = [{ type: "text", text: "途中の返答" }];
  release = provider.hold();
  assert.equal((await call("POST", `/api/runs/${runId}/messages`, { text: "続けて" })).status, 200);
  await until(() => store.getRun(runId)?.attention === true);
  assert.equal(store.getRun(runId)?.status, "running");
  const textId = store.listEvents(runId).findLast((e) => e.type === "text")!.id;
  // 一番下まで見た（その返答まで）: 既読
  assert.equal((await call("POST", `/api/runs/${runId}/seen`, { event_id: textId })).body.attention, false);
  release();
  await until(() => !runner.isBusy(runId));
  // 終わった: 未読。終わりの結果より前までしか見ていなければ未読のまま、終わりまで見たら既読
  assert.equal(store.getRun(runId)?.attention, true);
  assert.equal((await call("POST", `/api/runs/${runId}/seen`, { event_id: textId })).body.attention, true);
  const lastId = store.listEvents(runId).at(-1)!.id;
  assert.equal((await call("POST", `/api/runs/${runId}/seen`, { event_id: lastId })).body.attention, false);
  assert.equal((await call("POST", `/api/runs/${runId}/seen`, { event_id: "x" })).status, 400);
});

test("裏で動いている作業: 作業中はチャットの詳細で返し、SSE でも知らせ、作業が終わったら消す", async () => {
  const { call, project, runner, provider, bus } = setup();
  const seen: unknown[] = [];
  bus.subscribe((e) => {
    if (e.type === "run_background") seen.push(e.background);
  });
  const state = { tasks: [{ task_id: "b1", kind: "command" as const, description: "npm run dev" }], replied: true };
  provider.background = state;
  const release = provider.hold();
  const runId: number = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "動かして" })).body.id;
  await until(() => runner.backgroundState(runId) !== null);
  assert.deepEqual((await call("GET", `/api/runs/${runId}`)).body.background, state);
  release();
  await until(() => !runner.isBusy(runId));
  assert.equal((await call("GET", `/api/runs/${runId}`)).body.background, null);
  assert.deepEqual(seen, [state, null]);
});

test("停止: 止めるよう頼んでから作業が終わるまでは、詳細と SSE で停止中を知らせる", async () => {
  const { call, project, runner, provider, bus } = setup();
  const seen: boolean[] = [];
  bus.subscribe((e) => {
    if (e.type === "run_stopping") seen.push(e.stopping);
  });
  provider.hold();
  let finish = () => {};
  provider.slowStop = new Promise((resolve) => (finish = resolve));
  const runId: number = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "動かして" })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await call("GET", `/api/runs/${runId}`)).body.stopping, false);
  assert.deepEqual((await call("POST", `/api/runs/${runId}/cancel`)).body, { ok: true });
  // 2 回押しても知らせは 1 回
  await call("POST", `/api/runs/${runId}/cancel`);
  assert.equal((await call("GET", `/api/runs/${runId}`)).body.stopping, true);
  assert.equal(runner.isBusy(runId), true);
  finish();
  await until(() => !runner.isBusy(runId));
  const detail = (await call("GET", `/api/runs/${runId}`)).body;
  assert.equal(detail.stopping, false);
  assert.equal(detail.run.status, "cancelled");
  assert.deepEqual(seen, [true, false]);
});

test("チャット・グループの API", async () => {
  const { call, project, store, runner } = setup();
  const other = store.createProject({ name: "o", repo_path: tempDir(), provider: "claude" });
  const group = await call("POST", `/api/projects/${project.id}/groups`, { name: "g" });
  assert.equal(group.status, 201);
  const otherGroup = (await call("POST", `/api/projects/${other.id}/groups`, { name: "x" })).body;

  // 本文も添付もなければ送れない。ほかのプロジェクトのグループには入れられない
  assert.equal((await call("POST", `/api/projects/${project.id}/runs`, { phase: "requirements" })).status, 400);
  const cross = await call("POST", `/api/projects/${project.id}/runs`, { prompt: "x", group_id: otherGroup.id });
  assert.deepEqual(cross, { status: 400, body: { error: "ほかのプロジェクトのグループには入れられません" } });

  const started = await call("POST", `/api/projects/${project.id}/runs`, { prompt: "こんにちは", group_id: group.body.id });
  assert.equal(started.status, 201);
  const runId: number = started.body.id;
  await until(() => !runner.isBusy(runId));
  assert.equal(store.getRun(runId)?.group_id, group.body.id);

  assert.equal((await call("GET", `/api/projects/${project.id}/runs`)).body.length, 1);
  assert.equal((await call("GET", "/api/runs")).body.length, 1);
  const detail = await call("GET", `/api/runs/${runId}`);
  assert.equal(detail.body.run.id, runId);
  assert.ok(detail.body.events.length > 0);
  assert.deepEqual(detail.body.approvals, []);
  assert.deepEqual(await call("GET", "/api/runs/999"), { status: 404, body: { error: "実行が見つかりません" } });
  assert.ok(Array.isArray((await call("GET", `/api/search?q=${encodeURIComponent("こんにちは")}&project_id=${project.id}`)).body));
  // 絞り込み・件数が数でなければ 400（NaN を SQL に入れない）。件数の上限は 1000 に丸める
  assert.equal((await call("GET", "/api/search?q=a&project_id=x")).status, 400);
  assert.equal((await call("GET", "/api/search?q=a&limit=abc")).status, 400);
  assert.equal((await call("GET", "/api/search?q=a&run_id=")).status, 200);
  assert.equal((await call("GET", "/api/runs?limit=abc")).status, 400);
  assert.equal((await call("GET", "/api/runs?limit=0")).status, 400);
  assert.equal((await call("GET", "/api/runs?limit=5000")).body.length, 1);
  assert.equal((await call("GET", "/api/approvals?project_id=x")).status, 400);
  assert.deepEqual((await call("GET", `/api/approvals?project_id=${project.id}`)).body, []);

  // カンバンの列（stage）は AI の状態で決まるので、送っても受け付けず、返しもしない
  const renamed = await call("PATCH", `/api/runs/${runId}`, { title: "名前", stage: "todo", group_id: null });
  assert.equal(renamed.body.title, "名前");
  assert.equal("stage" in renamed.body, false);
  assert.equal(renamed.body.group_id, null);
  assert.equal((await call("PATCH", `/api/runs/${runId}`, { group_id: otherGroup.id })).status, 400);
  assert.equal((await call("PATCH", `/api/runs/${runId}`, { group_id: group.body.id })).body.group_id, group.body.id);

  assert.equal((await call("POST", `/api/runs/${runId}/seen`)).body.attention, false);
  // 未読にする・既読にする: 印だけを変え、最後に動いた時刻（並び順）は変えない
  const activeAt = store.getRun(runId)?.active_at;
  assert.equal((await call("POST", `/api/runs/${runId}/unseen`)).body.attention, true);
  assert.equal(store.getRun(runId)?.active_at, activeAt);
  assert.equal((await call("POST", `/api/runs/${runId}/seen`)).body.attention, false);
  assert.equal(store.getRun(runId)?.active_at, activeAt);
  // サイドバーの上に固定する・やめる: 並び順（最後に動いた時刻）は変えない
  assert.equal((await call("POST", `/api/runs/${runId}/pin`, { pinned: true })).body.pinned, true);
  assert.equal(store.getRun(runId)?.active_at, activeAt);
  assert.equal((await call("POST", `/api/runs/${runId}/pin`, { pinned: false })).body.pinned, false);
  assert.equal((await call("POST", `/api/runs/${runId}/pin`, {})).status, 400);
  assert.ok((await call("POST", `/api/runs/${runId}/archive`)).body.archived_at);
  assert.equal((await call("GET", `/api/projects/${project.id}/runs`)).body.length, 0);
  assert.equal((await call("GET", `/api/projects/${project.id}/runs?archived=1`)).body.length, 1);
  assert.equal((await call("POST", `/api/runs/${runId}/archive`, { archived: false })).body.archived_at, null);

  assert.equal((await call("POST", `/api/runs/${runId}/messages`, {})).status, 400);
  assert.equal((await call("POST", `/api/runs/${runId}/messages`, { text: "続き" })).status, 200);
  await until(() => !runner.isBusy(runId));
  assert.deepEqual((await call("POST", `/api/runs/${runId}/cancel`)).body, { ok: true });

  assert.deepEqual(
    (await call("PUT", `/api/projects/${project.id}/groups/order`, { ids: [group.body.id] })).body.map((g: { id: number }) => g.id),
    [group.body.id],
  );
  assert.equal((await call("PATCH", `/api/groups/${group.body.id}`, { name: "h" })).body.name, "h");
  assert.equal((await call("GET", `/api/projects/${project.id}/groups`)).body.length, 1);
  assert.deepEqual((await call("DELETE", `/api/groups/${group.body.id}`)).body, { ok: true });
  assert.equal(store.getRun(runId)?.group_id, null);
  assert.deepEqual(await call("PATCH", "/api/groups/999", { name: "x" }), { status: 404, body: { error: "グループが見つかりません" } });

  assert.deepEqual((await call("DELETE", `/api/runs/${runId}`)).body, { ok: true });
  assert.equal(store.getRun(runId), undefined);
});

test("チャットを別のプロジェクトへ移す: グループ・作業場所・ブランチを外し、並び順は変えない。作業中・知らないプロジェクトは断る", async () => {
  const { call, project, store, runner } = setup();
  const other = store.createProject({ name: "o", repo_path: tempDir(), provider: "claude" });
  const group = (await call("POST", `/api/projects/${project.id}/groups`, { name: "g" })).body;
  const runId: number = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "こんにちは", group_id: group.id })).body.id;
  await until(() => !runner.isBusy(runId));
  const activeAt = store.getRun(runId)?.active_at;

  assert.equal((await call("POST", `/api/runs/${runId}/move`, { project_id: 999 })).status, 404);
  assert.equal((await call("POST", `/api/runs/${runId}/move`, {})).status, 400);
  const moved = await call("POST", `/api/runs/${runId}/move`, { project_id: other.id });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.project_id, other.id);
  assert.equal(moved.body.group_id, null);
  assert.equal(moved.body.worktree_path, "");
  assert.equal(moved.body.branch, "");
  assert.equal(moved.body.active_at, activeAt);
  assert.equal((await call("GET", `/api/projects/${project.id}/runs`)).body.length, 0);
  assert.equal((await call("GET", `/api/projects/${other.id}/runs`)).body.length, 1);
  // 同じプロジェクトへの移動はそのまま返す
  assert.equal((await call("POST", `/api/runs/${runId}/move`, { project_id: other.id })).body.project_id, other.id);

  // 作業中は断る
  await call("POST", `/api/runs/${runId}/messages`, { text: "続き" });
  if (runner.isBusy(runId)) assert.equal((await call("POST", `/api/runs/${runId}/move`, { project_id: project.id })).status, 409);
  await until(() => !runner.isBusy(runId));
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
  assert.deepEqual(await call("POST", "/api/approvals/nope", { action: "allow" }), {
    status: 404,
    body: { error: "この依頼はすでに回答済みか、中断されています" },
  });
  assert.equal((await call("POST", "/api/approvals/nope", { action: "maybe" })).status, 400);

  // AI からの質問の「その他」に添えた添付は、回答の文にパスを書き添えて渡す（見つからない添付は書かない）
  const question = approvals.request(
    { runId: 1, projectId: project.id },
    { kind: "question", toolName: "AskUserQuestion", input: { questions: [] }, canRemember: false },
    new AbortController().signal,
  );
  const answered = await call("POST", `/api/approvals/${question.approval.id}`, {
    action: "answer",
    answers: { Q: "この画像のように" },
    attachments: { Q: [saved, { id: randomUUID(), name: "missing.png", mime: "image/png", size: 1 }] },
  });
  assert.equal(answered.status, 200);
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
  provider.commandList = [{ name: "review", description: "コードを見直す", argumentHint: "" }];
  const res = await call("GET", `/api/projects/${project.id}/commands`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, provider.commandList);
  assert.equal(provider.lastCommandsCwd, project.repo_path);
  assert.equal((await call("GET", "/api/projects/999/commands")).status, 404);
});

test("自動のアーカイブ: 完了して日数がたったチャットだけをアーカイブする（未読・固定はしない）。設定で日数を選ぶ", async () => {
  const { call, project, store } = setup();
  const finish = async (prompt: string) => {
    const run = (await call("POST", `/api/projects/${project.id}/runs`, { prompt })).body;
    await until(() => store.getRun(run.id)?.status === "completed");
    return run.id as number;
  };
  const done = await finish("終わったもの");
  const pinned = await finish("固定したもの");
  const unread = await finish("まだ見ていないもの");
  store.setRunAttention(done, false);
  store.setRunAttention(pinned, false);
  store.setRunPinned(pinned, true);
  store.setRunAttention(unread, true);

  // まだ日数がたっていなければ、何もしない
  assert.equal(store.archiveStaleRuns(7), 0);
  // 8 日後: 完了して確認済みのものだけ
  assert.equal(store.archiveStaleRuns(7, new Date(Date.now() + 8 * 86_400_000)), 1);
  assert.ok(store.getRun(done)?.archived_at);
  assert.equal(store.getRun(pinned)?.archived_at, null);
  assert.equal(store.getRun(unread)?.archived_at, null);

  // 設定（初めはしない。1〜365 日）
  assert.equal((await call("GET", "/api/settings")).body.autoArchiveDays, null);
  assert.equal((await call("PUT", "/api/settings", { autoArchiveDays: 0 })).status, 400);
  assert.equal((await call("PUT", "/api/settings", { autoArchiveDays: 7 })).body.autoArchiveDays, 7);
  assert.equal((await call("PUT", "/api/settings", { autoArchiveDays: null })).body.autoArchiveDays, null);
});

test("待ちの列の API: 作業中は列に入れ、並べ替え・消す・すぐ送る。作業中でなければすぐ送る", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await call("POST", `/api/runs/${runId}/queue`, {})).status, 400);
  assert.equal((await call("POST", `/api/runs/${runId}/queue`, { text: "2" })).body.queued, true);
  const third = (await call("POST", `/api/runs/${runId}/queue`, { text: "3" })).body;
  assert.equal(third.queued, true);
  assert.equal(typeof third.id, "string");
  const queue = (await call("GET", `/api/runs/${runId}`)).body.queue as { id: string; text: string }[];
  assert.deepEqual(queue.map((m) => m.text), ["2", "3"]);

  const moved = await call("POST", `/api/runs/${runId}/queue/${queue[1].id}/move`, { index: 0 });
  assert.deepEqual(moved.body.queue.map((m: { text: string }) => m.text), ["3", "2"]);
  assert.equal((await call("POST", `/api/runs/${runId}/queue/nope/move`, { index: 0 })).status, 404);
  // 書き換え（空にはできない）
  const edited = await call("PATCH", `/api/runs/${runId}/queue/${queue[1].id}`, { text: " 3 を直した " });
  assert.equal(edited.body.queue.find((m: { id: string }) => m.id === queue[1].id).text, "3 を直した");
  assert.equal((await call("PATCH", `/api/runs/${runId}/queue/${queue[1].id}`, { text: "  " })).status, 400);
  assert.equal((await call("PATCH", `/api/runs/${runId}/queue/nope`, { text: "x" })).status, 404);
  // 添付も置き換えられる（足す・外す）。添付があれば文は空にでき、文も添付もなくなるなら断る
  const image = { id: randomUUID(), name: "a.png", mime: "image/png", size: 10 };
  const withImage = await call("PATCH", `/api/runs/${runId}/queue/${queue[1].id}`, { text: "", attachments: [image] });
  assert.deepEqual(withImage.body.queue.find((m: { id: string }) => m.id === queue[1].id).attachments, [image]);
  assert.equal((await call("PATCH", `/api/runs/${runId}/queue/${queue[1].id}`, { text: "", attachments: [] })).status, 400);
  // 添付を省けば今のまま（文だけ直す）。外して元に戻す
  assert.deepEqual((await call("PATCH", `/api/runs/${runId}/queue/${queue[1].id}`, { text: "3 を直した" })).body.queue[0].attachments, [image]);
  assert.deepEqual((await call("PATCH", `/api/runs/${runId}/queue/${queue[1].id}`, { text: "3 を直した", attachments: [] })).body.queue[0].attachments, []);
  assert.deepEqual((await call("DELETE", `/api/runs/${runId}/queue/${queue[0].id}`)).body, { queue: [{ ...moved.body.queue[0], text: "3 を直した" }] });
  assert.equal((await call("DELETE", `/api/runs/${runId}/queue/nope`)).status, 404);
  assert.equal((await call("POST", `/api/runs/${runId}/queue/nope/send`)).status, 404);

  // すぐ送る: 作業中なら止めずに伝える（作業は止めない）
  assert.deepEqual((await call("POST", `/api/runs/${runId}/queue/${queue[1].id}/send`)).body, { ok: true });
  assert.deepEqual(provider.told, ["3 を直した"]);
  assert.deepEqual(runner.queued(runId), []);
  assert.equal(runner.isBusy(runId), true);
  release();
  await until(() => !runner.isBusy(runId));
  // 作業中でなければすぐ送る
  assert.deepEqual((await call("POST", `/api/runs/${runId}/queue`, { text: "4" })).body, { queued: false });
  await until(() => provider.prompts.length === 2);
  await until(() => !runner.isBusy(runId));
  // hold: 作業していなくても送らずに、列の最後に足す（止めている送信待ちがあるときの「ためておく」）
  const held = (await call("POST", `/api/runs/${runId}/queue`, { text: "5", hold: true })).body;
  assert.equal(held.queued, true);
  assert.deepEqual(runner.queued(runId).map((m) => m.text), ["5"]);
  assert.equal(runner.isBusy(runId), false);
  assert.equal(provider.prompts.length, 2);
});

test("待ちの列は再起動しても残る: 読み戻した列は止めておき、作業が終わっても送らない", async () => {
  const { call, project, runner, provider, store } = setup();
  const release = provider.hold();
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  await call("POST", `/api/runs/${runId}/queue`, { text: "2" });
  await call("POST", `/api/runs/${runId}/queue`, { text: "3" });
  // アプリを終えて起動し直したことにして、同じデータベースで作り直す
  const restarted = new Runner({ store, approvals: new ApprovalCenter(new Bus()), providers: { claude: provider } as never, usage: {} as never });
  assert.deepEqual(restarted.queued(runId).map((m) => m.text), ["2", "3"]);
  assert.equal(restarted.queuePaused(runId), true);
  release();
  await until(() => !runner.isBusy(runId));
});

test("待ちの列を止めておく API: 終わっても送らず、すぐ送るで 1 件ずつ送れ、戻すと先頭をすぐ送る。空になると自動に戻る", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  // 列が空なら止めない
  assert.deepEqual((await call("PUT", `/api/runs/${runId}/queue/paused`, { paused: true })).body, { paused: false, queue: [] });
  assert.equal((await call("PUT", `/api/runs/${runId}/queue/paused`, {})).status, 400);
  assert.equal((await call("PUT", "/api/runs/999/queue/paused", { paused: true })).status, 404);
  await call("POST", `/api/runs/${runId}/queue`, { text: "2" });
  await call("POST", `/api/runs/${runId}/queue`, { text: "3" });
  assert.equal((await call("PUT", `/api/runs/${runId}/queue/paused`, { paused: true })).body.paused, true);
  assert.equal((await call("GET", `/api/runs/${runId}`)).body.queue_paused, true);

  // 終わっても送らない
  release();
  await until(() => !runner.isBusy(runId));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(provider.prompts.length, 1);
  assert.deepEqual(runner.queued(runId).map((m) => m.text), ["2", "3"]);

  // すぐ送るで 1 件だけ送り、終わってもまた止まる
  const [first] = runner.queued(runId);
  await call("POST", `/api/runs/${runId}/queue/${first.id}/send`);
  await until(() => provider.prompts.length === 2 && !runner.isBusy(runId));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(provider.prompts.length, 2);
  assert.equal(runner.queuePaused(runId), true);

  // 自動で送るに戻すと、作業中でなければ先頭をすぐ送り、列が空になったら止めない状態に戻る
  assert.deepEqual((await call("PUT", `/api/runs/${runId}/queue/paused`, { paused: false })).body, { paused: false, queue: [] });
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "3");
  assert.equal(runner.queuePaused(runId), false);
});

test("待ちの列を 1 件ずつ順に送る API: まとめずに別々の発言として順に送り、止めておく・「ここまで」の印があっても最後まで送る", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await call("POST", `/api/runs/${runId}/queue/send-in-order`)).status, 404);
  assert.equal((await call("POST", "/api/runs/999/queue/send-in-order")).status, 404);
  for (const text of ["2", "3", "4"]) await call("POST", `/api/runs/${runId}/queue`, { text });
  await call("PUT", `/api/runs/${runId}/queue/paused`, { paused: true });
  await call("PUT", `/api/runs/${runId}/queue/stops`, { stops: [1] });
  release();
  await until(() => !runner.isBusy(runId));

  assert.deepEqual((await call("POST", `/api/runs/${runId}/queue/send-in-order`)).body, { ok: true });
  assert.equal(runner.queuePaused(runId), false);
  assert.deepEqual(runner.queueStops(runId), []);
  await until(() => provider.prompts.length === 4 && runner.queued(runId).length === 0 && !runner.isBusy(runId));
  // 1 つにまとめず、1 件ずつ別々の発言として送る
  assert.deepEqual(provider.prompts.slice(1), ["2", "3", "4"]);
});

test("「ここまで送ったら止めます」: 印は列の中の位置で持ち、いくつでも・1 件目の上にも置ける。印まで送って止め、自動に戻すと次の印まで送る", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  for (const text of ["2", "3", "4", "5"]) await call("POST", `/api/runs/${runId}/queue`, { text });
  const [, third] = runner.queued(runId);
  // 列にない指示には付けられない
  assert.equal((await call("PUT", `/api/runs/${runId}/queue/stop-after`, { id: "nope" })).status, 404);
  assert.equal((await call("PUT", `/api/runs/${runId}/queue/stop-after`, {})).status, 400);
  // 「3」のあと（2 件目のあと）に付け、位置をまとめて置き換える（ドラッグ）こともできる
  assert.deepEqual((await call("PUT", `/api/runs/${runId}/queue/stop-after`, { id: third.id })).body.stops, [2]);
  assert.deepEqual((await call("PUT", `/api/runs/${runId}/queue/stops`, { stops: [3, 2, 99] })).body.stops, [2, 3, 4]);
  assert.equal((await call("PUT", `/api/runs/${runId}/queue/stops`, { stops: [-1] })).status, 400);
  assert.deepEqual((await call("PUT", `/api/runs/${runId}/queue/stops`, { stops: [2, 3] })).body.stops, [2, 3]);
  assert.deepEqual((await call("GET", `/api/runs/${runId}`)).body.queue_stops, [2, 3]);

  // 「3」まで送ったら、残りは送らずに止めておく（止まった印は「4」の上に残る）
  release();
  await until(() => provider.prompts.length === 3 && !runner.isBusy(runId) && runner.queuePaused(runId));
  assert.deepEqual(provider.prompts, ["1", "2", "3"]);
  assert.deepEqual(runner.queued(runId).map((m) => m.text), ["4", "5"]);
  assert.deepEqual(runner.queueStops(runId), [0, 1]);

  // 自動で送るに戻すと、止まった印を越えて次の印（「4」のあと）まで送って、また止める
  await call("PUT", `/api/runs/${runId}/queue/paused`, { paused: false });
  await until(() => provider.prompts.length === 4 && !runner.isBusy(runId) && runner.queuePaused(runId));
  assert.deepEqual(runner.queued(runId).map((m) => m.text), ["5"]);
  assert.deepEqual(runner.queueStops(runId), [0]);

  // × で外す（位置の置き換え）
  assert.deepEqual((await call("PUT", `/api/runs/${runId}/queue/stops`, { stops: [] })).body.stops, []);
});

test("通信の切断: 送信待ちを送らずに止めて、つながったら自動で再開し、終わったら送信待ちを戻して送る", async () => {
  const { call, project, runner, provider, network, store } = setup();
  const release = provider.hold();
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  await call("POST", `/api/runs/${runId}/queue`, { text: "次" });
  // 作業中に通信が切れて失敗する
  provider.networkFailures = 1;
  network.online = false;
  release();
  await until(() => runner.reconnectState(runId) !== null);
  assert.equal(store.getRun(runId)?.status, "failed");
  assert.equal(runner.queuePaused(runId), true);
  assert.deepEqual(runner.queued(runId).map((m) => m.text), ["次"]);
  assert.deepEqual((await call("GET", `/api/runs/${runId}`)).body.reconnect, { attempts: 0, max: MAX_AUTO_RESUMES, agents: [] });
  assert.ok(store.listEvents(runId).some((e) => e.type === "notice" && /自動で再開します/.test(JSON.stringify(e.data))));
  // つながらない間は何も送らない（送信待ちも送らない）
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(provider.prompts, ["1"]);

  // つながったら「続けて」を送り、終わったら止めておいた送信待ちを戻して送る
  network.online = true;
  await until(() => provider.prompts.includes(RESUME_PROMPT));
  await until(() => provider.prompts.at(-1) === "次" && !runner.isBusy(runId));
  assert.equal(runner.queuePaused(runId), false);
  assert.equal(runner.reconnectState(runId), null);
});

test("通信の切断: 通信で止まったサブエージェントは、自動で再開するときに名前と ID を添えて続きから再開を頼む（自分で止めたものは頼まない）", async () => {
  const { call, project, runner, provider, network, store } = setup();
  network.online = false;
  provider.networkFailures = 1;
  // 裏で動かした 2 件: 調査は通信で親ごと止まり、レビューは自分で止めた
  provider.emits = [
    { type: "tool_use", id: "tu1", name: "Agent", input: { description: "調査", prompt: "調べて" } },
    { type: "tool_result", tool_use_id: "tu1", content: "Async agent launched successfully.\nagentId: a1", is_error: false },
    { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "調査", status: "running" },
    { type: "tool_use", id: "tu2", name: "Agent", input: { description: "レビュー" } },
    { type: "tool_result", tool_use_id: "tu2", content: "Async agent launched successfully.\nagentId: a2", is_error: false },
    { type: "subagent", task_id: "a2", tool_use_id: "tu2", description: "レビュー", status: "stopped" },
  ];
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => runner.reconnectState(runId) !== null);
  provider.emits = [];
  // つながるのを待っている間は、続きから再開を頼むサブエージェントの名前も返す（画面の待っている行に添える）
  assert.deepEqual((await call("GET", `/api/runs/${runId}`)).body.reconnect.agents, ["調査"]);
  const events = store.listEvents(runId);
  // 実行の終わりの記録に通信の切断の印。お知らせには、止まったサブエージェントの名前を添える
  assert.ok(events.some((e) => e.type === "result" && (e.data as { network?: boolean }).network === true));
  assert.ok(events.some((e) => e.type === "notice" && /通信で止まったサブエージェント 1 件（調査）/.test(JSON.stringify(e.data))));
  // 作業の終わりとともに止まった、という（通信でないときの）お知らせは出さない
  assert.ok(!events.some((e) => e.type === "notice" && /作業の終わりとともに止まりました/.test(JSON.stringify(e.data))));

  network.online = true;
  await until(() => provider.prompts.length === 2 && !runner.isBusy(runId));
  const resume = provider.prompts[1];
  assert.ok(resume.startsWith(RESUME_PROMPT));
  assert.match(resume, /「調査」（ID: a1）/);
  assert.doesNotMatch(resume, /a2/);
});

test("作業の終わり: 終わりの知らせがないまま止まったサブエージェントは、通信以外ならお知らせを残す", async () => {
  const { call, project, provider, store } = setup();
  provider.emits = [
    { type: "tool_use", id: "tu1", name: "Agent", input: { description: "調査" } },
    { type: "tool_result", tool_use_id: "tu1", content: "Async agent launched successfully.", is_error: false },
  ];
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => store.getRun(runId)?.status === "completed");
  assert.ok(store.listEvents(runId).some((e) => e.type === "notice" && /サブエージェント 1 件（調査）/.test(JSON.stringify(e.data))));
  // 次の実行では、前の実行のものを数え直さない
  provider.emits = [];
  await call("POST", `/api/runs/${runId}/messages`, { text: "次" });
  await until(() => store.listEvents(runId).filter((e) => e.type === "result").length === 2);
  assert.equal(store.listEvents(runId).filter((e) => e.type === "notice" && /作業の終わりとともに/.test(JSON.stringify(e.data))).length, 1);
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
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => store.getRun(runId)?.status === "completed");
  provider.emits = [];
  await call("POST", `/api/runs/${runId}/messages`, { text: "次" });
  await until(() => provider.prompts.length === 2);
  assert.ok(provider.prompts[1].startsWith("次\n"));
  assert.match(provider.prompts[1], /「調査」（ID: a1）の報告 ---\n見つけたのは 3 件/);
  const user = store.listEvents(runId).filter((e) => e.type === "user").at(-1)!;
  // 記録の自分の発言は、書いた文のまま（報告は印だけ）
  const { message_uuid: _id, ...userData } = user.data as { message_uuid?: string };
  assert.deepEqual(userData, { text: "次", handover: ["tu1"] });
  await until(() => store.listEvents(runId).filter((e) => e.type === "result").length === 2);
  await call("POST", `/api/runs/${runId}/messages`, { text: "その次" });
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "その次");
});

test("通信の切断: 続けて何度も止まったら、再開するかを聞き（回答待ち）、再開するで数え直して送る", async () => {
  const { call, project, runner, provider, network, approvals } = setup();
  network.online = true;
  // 最初の作業と、自動の再開の 3 回がすべて通信で失敗する
  provider.networkFailures = 1 + MAX_AUTO_RESUMES;
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => approvals.list({ runId }).length === 1);
  const [ask] = approvals.list({ runId });
  assert.equal(ask.kind, "reconnect");
  assert.equal(provider.prompts.filter((p) => p === RESUME_PROMPT).length, MAX_AUTO_RESUMES);
  assert.equal(runner.reconnectState(runId), null);

  // 再開する: すぐ「続けて」を送る（こんどは続く）
  assert.equal((await call("POST", `/api/approvals/${ask.id}`, { action: "allow" })).status, 200);
  await until(() => provider.prompts.filter((p) => p === RESUME_PROMPT).length === MAX_AUTO_RESUMES + 1 && !runner.isBusy(runId));
  assert.equal(approvals.list({ runId }).length, 0);
});

test("使用枠の上限: 送信待ちを止め、枠が戻ったら続けるかを聞く（勝手に再開しない）。続けるで再開し、終わったら送信待ちを戻す", async () => {
  const { call, project, runner, provider, approvals, store } = setup();
  const release = provider.hold();
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  await call("POST", `/api/runs/${runId}/queue`, { text: "次の指示" });
  // 枠が戻る時刻はもう過ぎている（すぐ聞く）
  provider.usageLimits = [new Date(Date.now() - 120_000).toISOString()];
  release();
  await until(() => approvals.list({ runId }).length === 1);
  const [ask] = approvals.list({ runId });
  assert.equal(ask.kind, "usage_limit");
  assert.match(ask.description ?? "", /送信待ちは、再開した作業が終わってから送ります/);
  // 聞いている間は何も送らず、送信待ちは止めてある
  assert.equal(provider.prompts.length, 1);
  assert.equal(runner.queuePaused(runId), true);
  assert.ok(store.listEvents(runId).some((e) => e.type === "notice" && /使用枠の上限に達したため止まりました/.test(JSON.stringify(e.data))));

  // 続ける: 「続けて」を送り、終わったら送信待ちを戻して送る
  assert.equal((await call("POST", `/api/approvals/${ask.id}`, { action: "allow" })).status, 200);
  await until(() => provider.prompts.length === 3 && !runner.isBusy(runId));
  assert.deepEqual(provider.prompts.slice(1), [USAGE_RESUME_PROMPT, "次の指示"]);
  assert.equal(runner.queuePaused(runId), false);
});

test("使用枠の上限: 戻る前は聞かず、その間に自分で送ったら聞くのをやめる。やめるを選んだら送信待ちは止めたまま", async () => {
  const { call, project, runner, provider, approvals } = setup();
  // 枠が戻るのはまだ先
  provider.usageLimits = [new Date(Date.now() + 3_600_000).toISOString()];
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => !runner.isBusy(runId));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(approvals.list({ runId }).length, 0);
  // 自分で送った: 待つのをやめる（送ったものは普通に動く）
  await call("POST", `/api/runs/${runId}/messages`, { text: "自分で続ける" });
  await until(() => provider.prompts.length === 2 && !runner.isBusy(runId));

  // やめる: 送信待ちは止めたまま（自分で戻す）
  const release = provider.hold();
  await call("POST", `/api/runs/${runId}/messages`, { text: "2" });
  await until(() => provider.prompts.length === 3);
  await call("POST", `/api/runs/${runId}/queue`, { text: "あとで" });
  provider.usageLimits = [new Date(Date.now() - 120_000).toISOString()];
  release();
  await until(() => approvals.list({ runId }).length === 1);
  await call("POST", `/api/approvals/${approvals.list({ runId })[0].id}`, { action: "deny" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(provider.prompts.length, 3);
  assert.equal(runner.queuePaused(runId), true);
  assert.deepEqual(runner.queued(runId).map((m) => m.text), ["あとで"]);
});

test("通信の切断: 自動で再開しない設定・「自動で再開しない」・自分で送ったときは待たない", async () => {
  const { call, project, runner, provider, network, store } = setup();
  network.online = false;
  // 設定で切ると、止まったことだけを知らせて待たない
  await call("PUT", "/api/settings", { autoResumeOnReconnect: false });
  provider.networkFailures = 1;
  const a = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "a" })).body.id;
  await until(() => store.getRun(a)?.status === "failed");
  assert.equal(runner.reconnectState(a), null);
  assert.equal((await call("DELETE", `/api/runs/${a}/reconnect`)).status, 404);

  // 待っている間に「自動で再開しない」を押すと、つながっても送らない
  await call("PUT", "/api/settings", { autoResumeOnReconnect: true });
  provider.networkFailures = 1;
  const b = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "b" })).body.id;
  await until(() => runner.reconnectState(b) !== null);
  assert.deepEqual((await call("DELETE", `/api/runs/${b}/reconnect`)).body, { ok: true });
  network.online = true;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(provider.prompts.includes(RESUME_PROMPT), false);

  // 自分で送ったら、待つのをやめてそのまま送る
  network.online = false;
  provider.networkFailures = 1;
  const c = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "c" })).body.id;
  await until(() => runner.reconnectState(c) !== null);
  await call("POST", `/api/runs/${c}/messages`, { text: "自分で続き" });
  assert.equal(runner.reconnectState(c), null);
  await until(() => !runner.isBusy(c));
  network.online = true;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(provider.prompts.includes(RESUME_PROMPT), false);
});

test("分岐の API: 作業の終わりの時点までの会話を新しいチャットに写す（元のチャットは変えない）", async () => {
  const { call, project, store, runner, provider } = setup();
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => store.getRun(runId)?.status === "completed");
  await call("POST", `/api/runs/${runId}/messages`, { text: "2" });
  await until(() => !runner.isBusy(runId) && store.listEvents(runId).filter((e) => e.type === "result").length === 2);
  const events = store.listEvents(runId);
  const first = events.find((e) => e.type === "result")!;
  assert.deepEqual([(first.data as { session_id?: string }).session_id, (first.data as { message_id?: string }).message_id], ["s1", "m1"]);

  const forked = await call("POST", `/api/runs/${runId}/fork`, { event_id: first.id });
  assert.equal(forked.status, 201);
  assert.equal(forked.body.title, `${store.getRun(runId)!.title}（分岐）`);
  assert.equal(forked.body.session_id, "fork-1");
  assert.deepEqual(provider.forks, [["s1", "m1", project.repo_path]]);
  // 写した記録は時刻もそのまま、最後に分岐した知らせ
  const copied = store.listEvents(forked.body.id);
  assert.deepEqual(copied.map((e) => e.type), ["user", "result", "notice"]);
  assert.equal(copied[0].created_at, events[0].created_at);
  assert.equal(store.listEvents(runId).length, events.length);

  // 分岐できない時点・見つからないチャット
  const user = events.find((e) => e.type === "user")!;
  assert.deepEqual(await call("POST", `/api/runs/${runId}/fork`, { event_id: user.id }), { status: 400, body: { error: "この時点からは分岐できません" } });
  assert.equal((await call("POST", "/api/runs/999/fork", { event_id: first.id })).status, 404);
  // 作業中は分岐できない
  const release = provider.hold();
  await call("POST", `/api/runs/${runId}/messages`, { text: "3" });
  assert.equal((await call("POST", `/api/runs/${runId}/fork`, { event_id: first.id })).status, 409);
  release();
  await until(() => !runner.isBusy(runId));
});

test("巻き戻し・分岐は、止めた作業の終わりを起点にしない（その時点のメッセージはセッションに残らないことがある）", async () => {
  const { call, project, store, provider } = setup();
  const runId: number = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => store.getRun(runId)?.status === "completed");
  const completed = store.listEvents(runId).find((e) => e.type === "result")!;
  // 以前の記録の形: 止めた作業の終わりにも message_id が付いている
  store.addEvent(runId, { type: "user", text: "2" });
  const cancelled = store.addEvent(runId, { type: "result", status: "cancelled", session_id: "s9", message_id: "m9" });
  const third = store.addEvent(runId, { type: "user", text: "3" });
  assert.equal((await call("POST", `/api/runs/${runId}/fork`, { event_id: cancelled.id })).status, 400);
  assert.equal((await call("POST", `/api/runs/${runId}/rewind`, { event_id: third.id, text: "3 を書き直し" })).status, 200);
  const data = completed.data as { session_id: string; message_id: string };
  assert.deepEqual(provider.forks.at(-1), [data.session_id, data.message_id, project.repo_path]);
});

test("巻き戻しの API: 自分の発言の手前まで戻し、書き直した文で送り直す（添付は引き継ぐ）", async () => {
  const { call, project, store, runner, provider } = setup();
  const attachment = { id: randomUUID(), name: "a.txt", mime: "text/plain", size: 1 };
  const runId: number = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => store.getRun(runId)?.status === "completed");
  await call("POST", `/api/runs/${runId}/messages`, { text: "2", attachments: [attachment] });
  await until(() => !runner.isBusy(runId) && store.listEvents(runId).filter((e) => e.type === "result").length === 2);
  const before = store.listEvents(runId);
  const [firstUser, secondUser] = before.filter((e) => e.type === "user");
  const firstResult = before.find((e) => e.type === "result")!;

  // 2 回目の発言を巻き戻す: 1 回目の終わりの時点から分岐し、その後ろの記録を消して、書き直した文を送る
  const rewound = await call("POST", `/api/runs/${runId}/rewind`, { event_id: secondUser.id, text: "2 を書き直し", options: { model: "m-x" } });
  assert.equal(rewound.status, 200);
  assert.equal(rewound.body.id, runId);
  assert.equal(rewound.body.model, "m-x");
  assert.deepEqual(provider.forks, [["s1", "m1", project.repo_path]]);
  await until(() => !runner.isBusy(runId) && provider.prompts.length === 3);
  assert.equal(provider.resumes[2], "fork-1");
  const after = store.listEvents(runId);
  assert.deepEqual(after.map((e) => e.type), ["user", "result", "notice", "user", "result"]);
  assert.deepEqual(after.slice(0, 2), before.slice(0, 2));
  assert.ok(after[2].id > firstResult.id && after[3].id > secondUser.id);
  const { message_uuid, ...rewrittenData } = after[3].data as { message_uuid?: string };
  assert.deepEqual(rewrittenData, { text: "2 を書き直し", attachments: [attachment] });
  // 発言には Claude Code に渡した ID を残す（ファイルを戻すときの目印）
  assert.equal(message_uuid, provider.promptIds[2]);
  // 消した発言は全文検索にも残らない
  assert.deepEqual(store.searchEvents("書き直し", { runId }).map((h) => h.event_id), [after[3].id]);
  assert.deepEqual(store.searchEvents("2", { runId }).map((h) => h.event_id), [after[3].id]);

  // 最初の発言を巻き戻す: 分岐せず、セッションを空にして最初から
  const forks = provider.forks.length;
  const resent = await call("POST", `/api/runs/${runId}/rewind`, { event_id: firstUser.id, text: "やり直し" });
  assert.equal(resent.status, 200);
  assert.equal(resent.body.session_id, null);
  await until(() => !runner.isBusy(runId) && provider.prompts.length === 4);
  assert.equal(provider.forks.length, forks);
  assert.equal(provider.resumes[3], null);
  assert.equal(provider.prompts[3], "やり直し");
  assert.deepEqual(store.listEvents(runId).map((e) => e.type), ["notice", "user", "result"]);

  // 自分の発言でない・ほかのチャットのイベント・見つからないチャットは断る
  const events = store.listEvents(runId);
  const result = events.find((e) => e.type === "result")!;
  const user = events.find((e) => e.type === "user")!;
  const notMine = await call("POST", `/api/runs/${runId}/rewind`, { event_id: result.id, text: "x" });
  assert.deepEqual(notMine, { status: 400, body: { error: "自分の発言のところからだけ巻き戻せます" } });
  const otherId: number = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "別" })).body.id;
  await until(() => !runner.isBusy(otherId));
  const otherUser = store.listEvents(otherId).find((e) => e.type === "user")!;
  assert.equal((await call("POST", `/api/runs/${runId}/rewind`, { event_id: otherUser.id, text: "x" })).status, 400);
  assert.equal((await call("POST", `/api/runs/${runId}/rewind`, { text: "x" })).status, 400);
  assert.equal((await call("POST", "/api/runs/999/rewind", { event_id: user.id, text: "x" })).status, 404);
  // 文も添付もなければ送れない
  assert.equal((await call("POST", `/api/runs/${runId}/rewind`, { event_id: user.id, text: "  " })).status, 400);

  // 作業中は断り、記録も待ちの列も変えない
  const release = provider.hold();
  await call("POST", `/api/runs/${runId}/messages`, { text: "3" });
  await call("POST", `/api/runs/${runId}/queue`, { text: "待ち" });
  const busyEvents = store.listEvents(runId).length;
  assert.equal((await call("POST", `/api/runs/${runId}/rewind`, { event_id: user.id, text: "x" })).status, 409);
  assert.equal(store.listEvents(runId).length, busyEvents);
  assert.equal(runner.queued(runId).length, 1);
  release();
  await until(() => !runner.isBusy(runId) && runner.queued(runId).length === 0);
  // ほかのチャットの記録は変わらない
  assert.deepEqual(store.listEvents(otherId).map((e) => e.type), ["user", "result"]);
});

test("チャットの記録の API: ほかのチャットのやり取りを Markdown の添付ファイルにして返す（そのまま添付として送れる）", async () => {
  const { call, project, store, provider } = setup();
  const source = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "前の話" })).body.id;
  await until(() => store.getRun(source)?.status === "completed");
  const res = await call("POST", `/api/runs/${source}/transcript`);
  assert.equal(res.status, 201);
  assert.equal(res.body.mime, "text/markdown");
  assert.match(res.body.name, /^チャット履歴-.+\.md$/);
  // 別のチャットに添付として送ると、指示に記録のファイルのパスが添えられる
  const target = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "続き", attachments: [res.body] })).body.id;
  await until(() => store.getRun(target)?.status === "completed");
  assert.match(provider.prompts.at(-1)!, /チャット履歴-.+\.md/);
  assert.equal((await call("POST", "/api/runs/99999/transcript")).status, 404);
});

test("ファイルを戻す API: 自分の発言を送る前の状態にファイルだけ戻す（会話はそのまま）。dry_run は量だけ。記録のない発言は 400", async () => {
  const { call, project, store, runner, provider } = setup();
  const runId: number = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => store.getRun(runId)?.status === "completed");
  const [user] = store.listEvents(runId).filter((e) => e.type === "user");
  const messageId = (user.data as { message_uuid: string }).message_uuid;
  assert.equal(messageId, provider.promptIds[0]);

  // 量だけを見る（戻さない・お知らせも残さない）
  const dry = await call("POST", `/api/runs/${runId}/rewind-files`, { event_id: user.id, dry_run: true });
  assert.deepEqual(dry.body, provider.rewindResult);
  assert.deepEqual(provider.rewinds, [["s1", messageId, project.repo_path, true]]);
  const events = store.listEvents(runId).length;
  // 戻す: お知らせを残し、会話の記録は消さない
  assert.equal((await call("POST", `/api/runs/${runId}/rewind-files`, { event_id: user.id })).status, 200);
  // 本当に戻したときの結果には変わったファイルが付かないので、先に量を測ってから戻す
  assert.deepEqual(provider.rewinds.slice(1).map((r) => r[3]), [true, false]);
  const after = store.listEvents(runId);
  assert.equal(after.length, events + 1);
  assert.match(JSON.stringify(after.at(-1)!.data), /2 個のファイル: a\.ts、b\.ts/);

  // 戻せない（Claude Code が断った）・記録のない発言・作業中
  provider.rewindResult = { canRewind: false, error: "No file checkpoint found" };
  assert.equal((await call("POST", `/api/runs/${runId}/rewind-files`, { event_id: user.id, dry_run: true })).status, 400);
  const old = store.addEvent(runId, { type: "user", text: "以前の発言" });
  assert.match((await call("POST", `/api/runs/${runId}/rewind-files`, { event_id: old.id })).body.error, /記録がない/);
  provider.rewindResult = { canRewind: true, filesChanged: [] };
  const release = provider.hold();
  await call("POST", `/api/runs/${runId}/messages`, { text: "2" });
  await until(() => runner.isBusy(runId));
  assert.equal((await call("POST", `/api/runs/${runId}/rewind-files`, { event_id: user.id })).status, 409);
  release();
  await until(() => !runner.isBusy(runId));
});

test("巻き戻しの API: restore_files なら、分岐する前にファイルも戻す（ファイルの記録は元のセッションにあるため）", async () => {
  const { call, project, store, runner, provider } = setup();
  const runId: number = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => store.getRun(runId)?.status === "completed");
  await call("POST", `/api/runs/${runId}/messages`, { text: "2" });
  await until(() => !runner.isBusy(runId) && store.listEvents(runId).filter((e) => e.type === "result").length === 2);
  const second = store.listEvents(runId).filter((e) => e.type === "user")[1];
  const messageId = (second.data as { message_uuid: string }).message_uuid;
  assert.equal((await call("POST", `/api/runs/${runId}/rewind`, { event_id: second.id, text: "2'", restore_files: true })).status, 200);
  // 元のセッション（s1）で（量を測って）戻してから、分岐する
  assert.deepEqual(provider.rewinds, [
    ["s1", messageId, project.repo_path, true],
    ["s1", messageId, project.repo_path, false],
  ]);
  assert.equal(provider.forks.length, 1);
  await until(() => !runner.isBusy(runId) && provider.prompts.length === 3);
  assert.ok(store.listEvents(runId).some((e) => e.type === "notice" && /ファイルもこの発言を送る前の状態に戻しました/.test(JSON.stringify(e.data))));
  // 戻せなければ、何も消さずに 400
  provider.rewindResult = { canRewind: false };
  const count = store.listEvents(runId).length;
  const third = store.listEvents(runId).filter((e) => e.type === "user")[1];
  assert.equal((await call("POST", `/api/runs/${runId}/rewind`, { event_id: third.id, text: "x", restore_files: true })).status, 400);
  assert.equal(store.listEvents(runId).length, count);
});

test("巻き戻しの API: 分岐に対応していないプロバイダーなら 400（最初の発言なら分岐しないので送れる）", async () => {
  const { call, project, store, runner, provider } = setup();
  const runId: number = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => !runner.isBusy(runId));
  await call("POST", `/api/runs/${runId}/messages`, { text: "2" });
  await until(() => !runner.isBusy(runId) && store.listEvents(runId).filter((e) => e.type === "result").length === 2);
  const [firstUser, secondUser] = store.listEvents(runId).filter((e) => e.type === "user");
  Object.assign(provider, { fork: undefined });
  const res = await call("POST", `/api/runs/${runId}/rewind`, { event_id: secondUser.id, text: "x" });
  assert.deepEqual(res, { status: 400, body: { error: "Fake は巻き戻しに対応していません" } });
  assert.equal(store.listEvents(runId).length, 4);
  assert.equal((await call("POST", `/api/runs/${runId}/rewind`, { event_id: firstUser.id, text: "y" })).status, 200);
  await until(() => !runner.isBusy(runId));
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
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await call("POST", `/api/runs/${runId}/queue/send-all`)).status, 404);
  // すべて消す
  await call("POST", `/api/runs/${runId}/queue`, { text: "消す" });
  assert.deepEqual((await call("DELETE", `/api/runs/${runId}/queue`)).body, { removed: 1, queue: [] });
  assert.deepEqual((await call("DELETE", `/api/runs/${runId}/queue`)).body, { removed: 0, queue: [] });
  await call("POST", `/api/runs/${runId}/queue`, { text: "A" });
  await call("POST", `/api/runs/${runId}/queue`, { text: "B" });
  assert.deepEqual((await call("POST", `/api/runs/${runId}/queue/send-all`)).body, { ok: true });
  assert.deepEqual(provider.told, ["A\n\nB"]);
  assert.deepEqual(runner.queued(runId), []);
  release();
  await until(() => !runner.isBusy(runId));
});

test("待ちの列の API: 選んだものだけ、まとめて送る・消す・いちばん上か下へ移す（ほかは並びを保つ）", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  const ids: string[] = [];
  for (const text of ["A", "B", "C", "D", "E"]) ids.push((await call("POST", `/api/runs/${runId}/queue`, { text })).body.id);
  const texts = () => runner.queued(runId).map((m) => m.text);
  // B と D をいちばん上へ、C をいちばん下へ
  assert.equal((await call("POST", `/api/runs/${runId}/queue/move-many`, { ids: [ids[3], ids[1]], to: "top" })).body.moved, 2);
  assert.deepEqual(texts(), ["B", "D", "A", "C", "E"]);
  await call("POST", `/api/runs/${runId}/queue/move-many`, { ids: [ids[2]], to: "bottom" });
  assert.deepEqual(texts(), ["B", "D", "A", "E", "C"]);
  assert.equal((await call("POST", `/api/runs/${runId}/queue/move-many`, { ids: [ids[0]], to: "middle" })).status, 400);
  // ドラッグで落とした位置へまとめて移す: B と A を E の前へ（並びは列の順のまま）、null ならいちばん下
  await call("POST", `/api/runs/${runId}/queue/move-many`, { ids: [ids[0], ids[1]], before: ids[4] });
  assert.deepEqual(texts(), ["D", "B", "A", "E", "C"]);
  await call("POST", `/api/runs/${runId}/queue/move-many`, { ids: [ids[3]], before: null });
  assert.deepEqual(texts(), ["B", "A", "E", "C", "D"]);
  await call("POST", `/api/runs/${runId}/queue/move-many`, { ids: [ids[3], ids[2]], before: ids[1] });
  assert.deepEqual(texts(), ["C", "D", "B", "A", "E"]);
  // to と before の両方・どちらもなしは 400
  assert.equal((await call("POST", `/api/runs/${runId}/queue/move-many`, { ids: [ids[0]], to: "top", before: null })).status, 400);
  assert.equal((await call("POST", `/api/runs/${runId}/queue/move-many`, { ids: [ids[0]] })).status, 400);
  // 元の並び（B D A E C）に戻す
  await call("POST", `/api/runs/${runId}/queue/move-many`, { ids: [ids[2]], to: "bottom" });
  await call("POST", `/api/runs/${runId}/queue/move-many`, { ids: [ids[1]], to: "top" });
  assert.deepEqual(texts(), ["B", "D", "A", "E", "C"]);
  // 止める線のある位置へ落とす: below_stop: false なら線の上（B D | A E C の C を A の前・線の上へ → B D C | A E）。ほかの指示は線の同じ側に残る
  await call("PUT", `/api/runs/${runId}/queue/stops`, { stops: [2] });
  await call("POST", `/api/runs/${runId}/queue/move-many`, { ids: [ids[2]], before: ids[0], below_stop: false });
  assert.deepEqual(texts(), ["B", "D", "C", "A", "E"]);
  assert.deepEqual(runner.queueStops(runId), [3]);
  // いちばん上へ移しても、線の上の B・D は線の上のまま（E が線を越えて上へ）
  await call("POST", `/api/runs/${runId}/queue/move-many`, { ids: [ids[4]], to: "top" });
  assert.deepEqual(texts(), ["E", "B", "D", "C", "A"]);
  assert.deepEqual(runner.queueStops(runId), [4]);
  // 元に戻す（線を外し、B D A E C に）
  await call("PUT", `/api/runs/${runId}/queue/stops`, { stops: [] });
  for (const i of [1, 3, 0, 4, 2]) await call("POST", `/api/runs/${runId}/queue/move-many`, { ids: [ids[i]], to: "bottom" });
  assert.deepEqual(texts(), ["B", "D", "A", "E", "C"]);
  // A と E を消す
  assert.equal((await call("POST", `/api/runs/${runId}/queue/remove-many`, { ids: [ids[0], ids[4], "nai"] })).body.removed, 2);
  assert.deepEqual(texts(), ["B", "D", "C"]);
  assert.equal((await call("POST", `/api/runs/${runId}/queue/remove-many`, { ids: [] })).status, 400);
  // C と B だけをまとめて送る（列の順につなぐ）。D は残る
  assert.deepEqual((await call("POST", `/api/runs/${runId}/queue/send-all`, { ids: [ids[2], ids[1]] })).body, { ok: true });
  assert.deepEqual(provider.told, ["B\n\nC"]);
  assert.deepEqual(texts(), ["D"]);
  assert.equal((await call("POST", `/api/runs/${runId}/queue/send-all`, { ids: ["nai"] })).status, 404);
  // 残った D が止めたあとに送られないよう、列を空にしてから止める
  await call("DELETE", `/api/runs/${runId}/queue`);
  runner.cancel(runId);
  await until(() => !runner.isBusy(runId));
  release();
});

test("止めずに伝える API: 作業中なら止めずに足して自分の発言に残し、足せなければ待ちの列へ。作業中でなければすぐ送る", async () => {
  const { call, project, runner, provider, store } = setup();
  const release = provider.hold();
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  // 作業中: 止めずに足す（待ちの列には入れない。作業も止めない）
  assert.deepEqual((await call("POST", `/api/runs/${runId}/tell`, { text: "ついでに" })).body, { result: "told" });
  assert.deepEqual(provider.told, ["ついでに"]);
  assert.deepEqual(runner.queued(runId), []);
  assert.equal(runner.isBusy(runId), true);
  assert.equal((store.listEvents(runId).findLast((e) => e.type === "user")?.data as { text?: string }).text, "ついでに");
  assert.equal((await call("POST", `/api/runs/${runId}/tell`, {})).status, 400);
  // 足せない（入力が閉じている）ときは待ちの列へ。行の「すぐ送る」で伝え直すときは先頭に戻す
  provider.acceptTell = false;
  assert.deepEqual((await call("POST", `/api/runs/${runId}/tell`, { text: "あとで" })).body, { result: "queued" });
  await call("POST", `/api/runs/${runId}/queue`, { text: "2 番目" });
  assert.deepEqual(runner.queued(runId).map((m) => m.text), ["あとで", "2 番目"]);
  await call("POST", `/api/runs/${runId}/queue/${runner.queued(runId)[1].id}/send`);
  assert.deepEqual(runner.queued(runId).map((m) => m.text), ["2 番目", "あとで"]);
  provider.acceptTell = true;
  await call("POST", `/api/runs/${runId}/queue/${runner.queued(runId)[1].id}/send`);
  assert.deepEqual(provider.told, ["ついでに", "あとで"]);
  // 裏の作業を 1 つ止める
  assert.deepEqual((await call("POST", `/api/runs/${runId}/background/b1/stop`)).body, { ok: true });
  assert.deepEqual(provider.stoppedTasks, ["b1"]);
  await call("DELETE", `/api/runs/${runId}/queue`);
  release();
  await until(() => !runner.isBusy(runId));
  assert.equal((await call("POST", `/api/runs/${runId}/background/b1/stop`)).status, 404);
  // 作業中でなければ、すぐ送る
  assert.deepEqual((await call("POST", `/api/runs/${runId}/tell`, { text: "ふつう" })).body, { result: "sent" });
  await until(() => provider.prompts.length === 2);
  assert.equal(provider.prompts[1], "ふつう");
});
