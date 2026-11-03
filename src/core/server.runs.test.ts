// API のテスト: チャット・グループ、添付・承認依頼・プロバイダー・使用枠、/ のコマンド、自動のアーカイブ（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { AUTH, setup, tempDir, until } from "./testing/testServer.js";

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

test("添付・承認依頼・プロバイダー・使用枠の API", async () => {
  const { app, call } = setup();
  assert.deepEqual(await call("POST", "/api/uploads"), { status: 400, body: { error: "ファイルがありません" } });
  const form = new FormData();
  form.append("file", new File(["hello"], "a.txt", { type: "text/plain" }));
  const uploaded = await app.request("/api/uploads", { method: "POST", headers: AUTH, body: form });
  assert.equal(uploaded.status, 201);
  const [saved] = (await uploaded.json()) as { id: string; name: string }[];
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

test("自動のアーカイブ: 完了して日数がたったチャットだけをアーカイブする（確認待ち・固定はしない）。設定で日数を選ぶ", async () => {
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
  assert.deepEqual((await call("DELETE", `/api/runs/${runId}/queue/${queue[0].id}`)).body, { queue: [{ ...moved.body.queue[0], text: "3 を直した" }] });
  assert.equal((await call("DELETE", `/api/runs/${runId}/queue/nope`)).status, 404);
  assert.equal((await call("POST", `/api/runs/${runId}/queue/nope/send`)).status, 404);

  // すぐ送る: いまの作業を止めてから送る（送った指示も作業中のまま）
  assert.deepEqual((await call("POST", `/api/runs/${runId}/queue/${queue[1].id}/send`)).body, { ok: true });
  await until(() => provider.prompts.length === 2);
  assert.equal(provider.prompts[1], "3 を直した");
  assert.deepEqual(runner.queued(runId), []);
  runner.cancel(runId);
  await until(() => !runner.isBusy(runId));
  release();
  // 作業中でなければすぐ送る
  assert.deepEqual((await call("POST", `/api/runs/${runId}/queue`, { text: "4" })).body, { queued: false });
  await until(() => provider.prompts.length === 3);
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
  assert.deepEqual(after[3].data, { text: "2 を書き直し", attachments: [attachment] });
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

test("待ちの列の API: すべて消す・まとめて送る（文は空行でつなぎ、添付も合わせる。作業中なら止めてから送る）", async () => {
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
  await until(() => provider.prompts.length === 2);
  assert.equal(provider.prompts[1], "A\n\nB");
  assert.deepEqual(runner.queued(runId), []);
  runner.cancel(runId);
  await until(() => !runner.isBusy(runId));
  release();
});

test("割り込んで送る API: 待ちの列には入れず、いまの作業を止めてから、待ちの列より先に送る", async () => {
  const { call, project, runner, provider } = setup();
  const release = provider.hold();
  const runId = (await call("POST", `/api/projects/${project.id}/runs`, { prompt: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  await call("POST", `/api/runs/${runId}/queue`, { text: "待ち" });
  // 割り込みの指示は、待ちの列に入らない
  const seen: string[][] = [];
  assert.deepEqual((await call("POST", `/api/runs/${runId}/interrupt`, { text: "割り込み" })).body, { ok: true });
  seen.push(runner.queued(runId).map((m) => m.text));
  await until(() => provider.prompts.length === 2);
  assert.equal(provider.prompts[1], "割り込み");
  assert.deepEqual(seen, [["待ち"]]);
  assert.deepEqual(runner.queued(runId).map((m) => m.text), ["待ち"]);
  assert.equal((await call("POST", `/api/runs/${runId}/interrupt`, {})).status, 400);
  runner.removeQueued(runId, runner.queued(runId)[0].id);
  runner.cancel(runId);
  await until(() => !runner.isBusy(runId));
  release();
  // 作業中でなければ、すぐ送る
  await call("POST", `/api/runs/${runId}/interrupt`, { text: "ふつう" });
  await until(() => provider.prompts.length === 3);
  assert.equal(provider.prompts[2], "ふつう");
});
