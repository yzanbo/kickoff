// API のテスト: チャット・グループ、添付・承認依頼・プロバイダー・使用枠、/ のコマンド、自動のアーカイブ（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
  assert.deepEqual((await call("POST", `/api/runs/${runId}/queue`, { text: "2" })).body, { queued: true });
  assert.deepEqual((await call("POST", `/api/runs/${runId}/queue`, { text: "3" })).body, { queued: true });
  const queue = (await call("GET", `/api/runs/${runId}`)).body.queue as { id: string; text: string }[];
  assert.deepEqual(queue.map((m) => m.text), ["2", "3"]);

  const moved = await call("POST", `/api/runs/${runId}/queue/${queue[1].id}/move`, { index: 0 });
  assert.deepEqual(moved.body.queue.map((m: { text: string }) => m.text), ["3", "2"]);
  assert.equal((await call("POST", `/api/runs/${runId}/queue/nope/move`, { index: 0 })).status, 404);
  assert.deepEqual((await call("DELETE", `/api/runs/${runId}/queue/${queue[0].id}`)).body, { queue: [moved.body.queue[0]] });
  assert.equal((await call("DELETE", `/api/runs/${runId}/queue/nope`)).status, 404);
  assert.equal((await call("POST", `/api/runs/${runId}/queue/nope/send`)).status, 404);

  // すぐ送る: いまの作業を止めてから送る（送った指示も作業中のまま）
  assert.deepEqual((await call("POST", `/api/runs/${runId}/queue/${queue[1].id}/send`)).body, { ok: true });
  await until(() => provider.prompts.length === 2);
  assert.equal(provider.prompts[1], "3");
  assert.deepEqual(runner.queued(runId), []);
  runner.cancel(runId);
  await until(() => !runner.isBusy(runId));
  release();
  // 作業中でなければすぐ送る
  assert.deepEqual((await call("POST", `/api/runs/${runId}/queue`, { text: "4" })).body, { queued: false });
  await until(() => provider.prompts.length === 3);
});
