// API のテスト: チャット（一覧・作成・変更・固定・並び・アーカイブ・移動・自動のアーカイブ・GitHub の結び付き）・グループ（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "vitest";
import { setup, until } from "@/app/core/testing/testServer";
import { tempDir } from "@/foundation/core/testing/tempDir";

test("チャットの一覧: 件数で黙って切らず、最後に動いた順に返す。?archived=1 はアーカイブ済みだけ", async () => {
  const { call, api, project, store } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const ids: number[] = [];
  for (let i = 0; i < 305; i++) ids.push(store.chats.create({ project_id: i % 2 ? project.id : other.id, provider: "claude", title: `c${i}`, status: "completed" }).id);
  // いちばん古いチャットが、最後に作ったチャットより後の時刻（同じだと ID の順）に動いた（状態が変わると、最後に動いた時刻が進んで並びの先頭へ）。アーカイブ済みは別に読む
  await until(() => Date.now() > Date.parse(store.chats.get(ids.at(-1)!)!.active_at));
  store.chats.update(ids[0], { status: "running" });
  store.chats.archive(ids[1], true);

  const all = (await api("GET /api/chats")).body as { id: number }[];
  assert.equal(all.length, 304);
  assert.equal(all[0].id, ids[0]);
  assert.deepEqual((await api("GET /api/chats", { query: { archived: "1" } })).body.map((r: { id: number }) => r.id), [ids[1]]);
  assert.equal((await call("GET", "/api/chats?limit=5")).body.length, 5);
  const mine = (await api("GET /api/projects/:projectId/chats", { params: { projectId: project.id } })).body as { id: number; project_id: number }[];
  assert.equal(mine.length, 151);
  assert.ok(mine.every((r) => r.project_id === project.id));
  assert.deepEqual((await api("GET /api/projects/:projectId/chats", { params: { projectId: project.id }, query: { archived: "1" } })).body.map((r: { id: number }) => r.id), [ids[1]]);
  assert.equal((await api("GET /api/projects/:projectId/chats", { params: { projectId: other.id }, query: { archived: "1" } })).body.length, 0);
});

test("チャット・グループの API", async () => {
  const { call, api, project, store, runner } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const group = await api("POST /api/projects/:projectId/groups", { params: { projectId: project.id }, body: { name: "g" } });
  assert.equal(group.status, 201);
  // グループの色は、同じプロジェクトのほかのグループと被らない色を作ったときに選ぶ
  const second = (await api("POST /api/projects/:projectId/groups", { params: { projectId: project.id }, body: { name: "g2" } })).body;
  assert.equal(typeof group.body.hue, "number");
  assert.notEqual(second.hue, group.body.hue);
  await api("DELETE /api/groups/:groupId", { params: { groupId: second.id } });
  const otherGroup = (await api("POST /api/projects/:projectId/groups", { params: { projectId: other.id }, body: { name: "x" } })).body;

  // 本文も添付もなければ送れない。ほかのプロジェクトのグループには入れられない
  assert.equal((await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: {} })).status, 400);
  const cross = await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "x", group_id: otherGroup.id } });
  assert.deepEqual(cross, { status: 400, body: { error: "ほかのプロジェクトのグループには入れられません" } });

  const started = await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "こんにちは", group_id: group.body.id } });
  assert.equal(started.status, 201);
  const chatId: number = started.body.id;
  await until(() => !runner.isBusy(chatId));
  assert.equal(store.chats.get(chatId)?.group_id, group.body.id);

  assert.equal((await api("GET /api/projects/:projectId/chats", { params: { projectId: project.id } })).body.length, 1);
  assert.equal((await api("GET /api/chats")).body.length, 1);
  const detail = await api("GET /api/chats/:chatId", { params: { chatId: chatId } });
  assert.equal(detail.body.chat.id, chatId);
  assert.ok(detail.body.events.length > 0);
  assert.deepEqual(detail.body.approvals, []);
  assert.deepEqual(await api("GET /api/chats/:chatId", { params: { chatId: 999 } }), { status: 404, body: { error: "チャットが見つかりません" } });
  assert.ok(Array.isArray((await api("GET /api/search", { query: { q: "こんにちは", project_id: project.id } })).body));
  // 絞り込み・件数が数でなければ 400（NaN を SQL に入れない）。件数の上限は 1000 に丸める
  assert.equal((await call("GET", "/api/search?q=a&project_id=x")).status, 400);
  assert.equal((await call("GET", "/api/search?q=a&limit=abc")).status, 400);
  assert.equal((await call("GET", "/api/search?q=a&chat_id=")).status, 200);
  assert.equal((await call("GET", "/api/chats?limit=abc")).status, 400);
  assert.equal((await call("GET", "/api/chats?limit=0")).status, 400);
  assert.equal((await call("GET", "/api/chats?limit=5000")).body.length, 1);
  assert.equal((await call("GET", "/api/chats?archived=yes")).status, 400);
  assert.equal((await call("GET", "/api/approvals?project_id=x")).status, 400);
  assert.deepEqual((await api("GET /api/approvals", { query: { project_id: project.id } })).body, []);

  // カンバンの列（stage）は AI の状態で決まるので、送っても受け付けず、返しもしない
  const renamed = await call("PATCH", `/api/chats/${chatId}`, { title: "名前", stage: "todo", group_id: null });
  assert.equal(renamed.body.title, "名前");
  assert.equal("stage" in renamed.body, false);
  assert.equal(renamed.body.group_id, null);
  assert.equal((await api("PATCH /api/chats/:chatId", { params: { chatId: chatId }, body: { group_id: otherGroup.id } })).status, 400);
  assert.equal((await api("PATCH /api/chats/:chatId", { params: { chatId: chatId }, body: { group_id: group.body.id } })).body.group_id, group.body.id);

  assert.equal((await api("POST /api/chats/:chatId/seen", { params: { chatId: chatId } })).body.unread, false);
  // 未読にする・既読にする: 印だけを変え、最後に動いた時刻（並び順）は変えない
  const activeAt = store.chats.get(chatId)?.active_at;
  assert.equal((await api("POST /api/chats/:chatId/unseen", { params: { chatId: chatId } })).body.unread, true);
  assert.equal(store.chats.get(chatId)?.active_at, activeAt);
  assert.equal((await api("POST /api/chats/:chatId/seen", { params: { chatId: chatId } })).body.unread, false);
  assert.equal(store.chats.get(chatId)?.active_at, activeAt);
  // サイドバーの上に固定する・やめる（プロジェクトと同じく PATCH）: 並び順（最後に動いた時刻）は変えない
  assert.equal((await api("PATCH /api/chats/:chatId", { params: { chatId: chatId }, body: { pinned: true } })).body.pinned, true);
  assert.equal(store.chats.get(chatId)?.active_at, activeAt);
  assert.equal((await api("PATCH /api/chats/:chatId", { params: { chatId: chatId }, body: { pinned: false } })).body.pinned, false);
  assert.equal((await call("PATCH", `/api/chats/${chatId}`, { pinned: "yes" })).status, 400);
  // アーカイブ・戻す（しまったままもう一度しまっても、しまった日時は変えない）。並び順は変えない
  const archived = (await api("PATCH /api/chats/:chatId", { params: { chatId: chatId }, body: { archived: true } })).body;
  assert.ok(archived.archived_at);
  assert.equal((await api("PATCH /api/chats/:chatId", { params: { chatId: chatId }, body: { archived: true } })).body.archived_at, archived.archived_at);
  assert.equal(store.chats.get(chatId)?.active_at, activeAt);
  // 一覧はアーカイブしていないものだけ、?archived=1 はアーカイブ済みだけ（全プロジェクト・プロジェクトごとで同じ）
  assert.equal((await api("GET /api/projects/:projectId/chats", { params: { projectId: project.id } })).body.length, 0);
  assert.equal((await api("GET /api/projects/:projectId/chats", { params: { projectId: project.id }, query: { archived: "1" } })).body.length, 1);
  assert.equal((await api("GET /api/chats")).body.length, 0);
  assert.equal((await api("GET /api/chats", { query: { archived: "1" } })).body.length, 1);
  // いくつかの項目を一度に変えられる
  const restored = (await api("PATCH /api/chats/:chatId", { params: { chatId: chatId }, body: { archived: false, pinned: true, title: "名前2" } })).body;
  assert.deepEqual([restored.archived_at, restored.pinned, restored.title], [null, true, "名前2"]);
  await api("PATCH /api/chats/:chatId", { params: { chatId: chatId }, body: { pinned: false } });

  assert.equal((await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: {} })).status, 400);
  assert.equal((await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "続き" } })).status, 200);
  await until(() => !runner.isBusy(chatId));
  assert.equal((await api("POST /api/chats/:chatId/cancel", { params: { chatId: chatId } })).status, 204);

  assert.deepEqual(
    (await api("PUT /api/projects/:projectId/groups/order", { params: { projectId: project.id }, body: { ids: [group.body.id] } })).body.map((g: { id: number }) => g.id),
    [group.body.id],
  );
  assert.equal((await api("PATCH /api/groups/:groupId", { params: { groupId: group.body.id }, body: { name: "h" } })).body.name, "h");
  assert.equal((await api("GET /api/projects/:projectId/groups", { params: { projectId: project.id } })).body.length, 1);
  assert.deepEqual(await api("DELETE /api/groups/:groupId", { params: { groupId: group.body.id } }), { status: 204, body: undefined });
  assert.equal(store.chats.get(chatId)?.group_id, null);
  assert.deepEqual(await api("PATCH /api/groups/:groupId", { params: { groupId: 999 }, body: { name: "x" } }), { status: 404, body: { error: "グループが見つかりません" } });

  // 削除はゴミ箱へ（入れたゴミ箱の ID を返す）
  assert.equal((await api("DELETE /api/chats/:chatId", { params: { chatId: chatId } })).status, 200);
  assert.equal(store.chats.get(chatId), undefined);
});

test("チャットの手動の並び: ids の順に position を振り、ほかのプロジェクトのチャットは無視する。最後に動いた時刻は進めない", async () => {
  const { call, api, project, store } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const a = store.chats.create({ project_id: project.id, provider: "claude", title: "a", status: "completed" });
  const b = store.chats.create({ project_id: project.id, provider: "claude", title: "b", status: "completed" });
  const c = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const x = store.chats.create({ project_id: other.id, provider: "claude", title: "x", status: "completed" });
  // 新しいチャットはまだ並べていない
  assert.equal(a.position, null);
  const res = await api("PUT /api/projects/:projectId/chats/order", { params: { projectId: project.id }, body: { ids: [c.id, x.id, a.id] } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((r: { id: number }) => r.id), [c.id, a.id]);
  assert.equal(store.chats.get(c.id)?.position, 0);
  // ほかのプロジェクトのチャットは変えず、ids にないチャットもそのまま（番号は ids の中の位置）
  assert.equal(store.chats.get(x.id)?.position, null);
  assert.equal(store.chats.get(a.id)?.position, 2);
  assert.equal(store.chats.get(b.id)?.position, null);
  assert.equal(store.chats.get(a.id)?.active_at, a.active_at);
  assert.equal((await call("PUT", `/api/projects/${project.id}/chats/order`, { ids: ["x"] })).status, 400);
  assert.equal((await api("PUT /api/projects/:projectId/chats/order", { params: { projectId: 999 }, body: { ids: [] } })).status, 404);
});

test("新しいチャットの名前: 送る前に付けた名前（前後の空白を除く）で作り、AI に名前を付けてもらわない。空白だけ・長すぎる名前は断る", async () => {
  const { api, project, runner, store } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const started = await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "最初の指示", title: "  送る前の名前  " } });
  assert.equal(started.status, 201);
  assert.equal(started.body.title, "送る前の名前");
  await until(() => !runner.isBusy(started.body.id));
  assert.equal(store.chats.get(started.body.id)?.title, "送る前の名前");
  assert.equal((await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "x", title: "   " } })).status, 400);
  assert.equal((await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "x", title: "あ".repeat(101) } })).status, 400);
});

test("作業中のチャットはアーカイブ・削除できない（409）。断るときはほかの項目も変えない", async () => {
  const { api, project, runner, provider, store } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const release = provider.hold();
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  const busy = await api("PATCH /api/chats/:chatId", { params: { chatId: chatId }, body: { archived: true, pinned: true } });
  assert.deepEqual(busy, { status: 409, body: { error: "作業中のチャットはアーカイブできません。終わってから（または中断してから）行ってください" } });
  assert.equal(store.chats.get(chatId)?.pinned, false);
  assert.equal(store.chats.get(chatId)?.archived_at, null);
  assert.equal((await api("DELETE /api/chats/:chatId", { params: { chatId: chatId } })).status, 409);
  // 固定は作業中でもできる
  assert.equal((await api("PATCH /api/chats/:chatId", { params: { chatId: chatId }, body: { pinned: true } })).body.pinned, true);
  release();
  await until(() => !runner.isBusy(chatId));
});

test("チャットを別のプロジェクトへ移す: グループ・作業場所・ブランチを外し、並び順は変えない。作業中・知らないプロジェクトは断る", async () => {
  const { call, api, project, store, runner } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const group = (await api("POST /api/projects/:projectId/groups", { params: { projectId: project.id }, body: { name: "g" } })).body;
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "こんにちは", group_id: group.id } })).body.id;
  await until(() => !runner.isBusy(chatId));
  const activeAt = store.chats.get(chatId)?.active_at;

  assert.equal((await api("POST /api/chats/:chatId/move", { params: { chatId: chatId }, body: { project_id: 999 } })).status, 404);
  assert.equal((await call("POST", `/api/chats/${chatId}/move`, {})).status, 400);
  const moved = await api("POST /api/chats/:chatId/move", { params: { chatId: chatId }, body: { project_id: other.id } });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.project_id, other.id);
  assert.equal(moved.body.group_id, null);
  assert.equal(moved.body.worktree_path, null);
  assert.equal(moved.body.branch, null);
  assert.equal(moved.body.active_at, activeAt);
  assert.equal((await api("GET /api/projects/:projectId/chats", { params: { projectId: project.id } })).body.length, 0);
  assert.equal((await api("GET /api/projects/:projectId/chats", { params: { projectId: other.id } })).body.length, 1);
  // 同じプロジェクトへの移動はそのまま返す
  assert.equal((await api("POST /api/chats/:chatId/move", { params: { chatId: chatId }, body: { project_id: other.id } })).body.project_id, other.id);

  // 作業中は断る
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "続き" } });
  if (runner.isBusy(chatId)) assert.equal((await api("POST /api/chats/:chatId/move", { params: { chatId: chatId }, body: { project_id: project.id } })).status, 409);
  await until(() => !runner.isBusy(chatId));
});

test("自動のアーカイブ: 完了して日数がたったチャットだけをアーカイブする（未読・固定はしない）。設定で日数を選ぶ", async () => {
  const { call, api, project, store } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const finish = async (prompt: string) => {
    const chat = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: prompt } })).body;
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

test("GitHub の結び付き: 作るときに付け、PUT で付け替え、DELETE で外す（形が違えば 400・最後に動いた時刻は進めない）", async () => {
  const { call, api, project, store } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const created = await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "直して", github: { repo: "o/r", number: 12, kind: "issue" } } });
  assert.equal(created.status, 201);
  assert.deepEqual([created.body.github_repo, created.body.github_number, created.body.github_kind], ["o/r", 12, "issue"]);
  assert.equal((await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "x", github: { repo: "not a repo", number: 1, kind: "issue" } } })).status, 400);

  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const put = await api("PUT /api/chats/:chatId/github", { params: { chatId: chat.id }, body: { repo: "o/r", number: 5, kind: "pr" } });
  assert.equal(put.status, 200);
  assert.deepEqual([put.body.github_repo, put.body.github_number, put.body.github_kind], ["o/r", 5, "pr"]);
  assert.equal(put.body.active_at, chat.active_at);
  assert.equal((await api("PUT /api/chats/:chatId/github", { params: { chatId: chat.id }, body: { repo: "o/r", number: 0, kind: "pr" } })).status, 400);
  assert.equal((await call("PUT", `/api/chats/${chat.id}/github`, { repo: "o/r", number: 5, kind: "discussion" })).status, 400);

  const removed = await api("DELETE /api/chats/:chatId/github", { params: { chatId: chat.id } });
  assert.deepEqual([removed.body.github_repo, removed.body.github_number, removed.body.github_kind], [null, null, null]);
  assert.equal((await api("DELETE /api/chats/:chatId/github", { params: { chatId: 99999 } })).status, 404);
});

