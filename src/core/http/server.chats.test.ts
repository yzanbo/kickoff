// API のテスト: チャット（一覧・作成・変更・固定・アーカイブ・移動・削除・記録）・グループ、添付・承認依頼・プロバイダー・使用枠・既定の推論の深さ、/ のコマンド、自動のアーカイブ（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { AUTH, setup, until } from "../testing/testServer.js";
import { tempDir } from "../testing/tempDir.js";

test("チャットの一覧: 件数で黙って切らず、最後に動いた順に返す。?archived=1 はアーカイブ済みだけ", async () => {
  const { call, project, store } = setup();
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const ids: number[] = [];
  for (let i = 0; i < 305; i++) ids.push(store.chats.create({ project_id: i % 2 ? project.id : other.id, provider: "claude", title: `c${i}`, status: "completed" }).id);
  // いちばん古いチャットが動いた（状態が変わると、最後に動いた時刻が進んで並びの先頭へ）。アーカイブ済みは別に読む
  await new Promise((resolve) => setTimeout(resolve, 5));
  store.chats.update(ids[0], { status: "running" });
  store.chats.archive(ids[1], true);

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
    { kind: "question", toolName: "AskUserQuestion", input: { questions: [] }, canRemember: false, toolUseId: "tq", agentId: "a1b2" },
    new AbortController().signal,
  );
  // どの呼び出し・どのサブエージェントの依頼か（画面がサブエージェントごとに回答待ちを見せる）を一覧に出す
  const listed = (await call("GET", "/api/approvals")).body as { tool_use_id?: string; agent_id?: string }[];
  assert.deepEqual([listed[0]?.tool_use_id, listed[0]?.agent_id], ["tq", "a1b2"]);
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

test("チャットのやり取りの記録の API: 全部のやり取りを Markdown で返す（コピー用。断り書きは入れない）", async () => {
  const { call, project, store } = setup();
  const id = (await call("POST", `/api/projects/${project.id}/chats`, { text: "前の話" })).body.id;
  await until(() => store.chats.get(id)?.status === "completed");
  const res = await call("GET", `/api/chats/${id}/transcript`);
  assert.equal(res.status, 200);
  assert.match(res.body.markdown, /^# チャット「.*」の記録/);
  assert.match(res.body.markdown, /## 自分（.+）\n\n前の話/);
  assert.doesNotMatch(res.body.markdown, /参照のために書き出したもの/);
  assert.equal((await call("GET", "/api/chats/99999/transcript")).status, 404);
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

test("ツールの結果の画像: 作業場所などの中の画像だけを、いまの中身と最後に変えた時刻で返す", async () => {
  const { app, project, store } = setup();
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "画像", status: "completed" });
  const file = path.join(project.repo_path, "画面.png");
  fs.writeFileSync(file, new Uint8Array([137, 80, 78, 71]));
  const outside = path.join(tempDir(), "外.png");
  fs.writeFileSync(outside, new Uint8Array([1]));
  const get = (p: string, id = chat.id) => app.request(`/api/chats/${id}/tool-image?path=${encodeURIComponent(p)}`, { headers: AUTH });

  const ok = await get(file);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
  assert.equal(ok.headers.get("content-security-policy"), "sandbox");
  assert.equal(Number(ok.headers.get("x-file-mtime")), Math.floor(fs.statSync(file).mtimeMs));
  assert.deepEqual([...new Uint8Array(await ok.arrayBuffer())], [137, 80, 78, 71]);
  // 外・画像でない・パスなしは 400、ないファイル・ないチャットは 404、トークンなしは 401
  assert.equal((await get(outside)).status, 400);
  assert.equal((await get(path.join(project.repo_path, "a.txt"))).status, 400);
  assert.equal((await app.request(`/api/chats/${chat.id}/tool-image`, { headers: AUTH })).status, 400);
  assert.equal((await get(path.join(project.repo_path, "ない.png"))).status, 404);
  assert.equal((await get(file, 9999)).status, 404);
  assert.equal((await app.request(`/api/chats/${chat.id}/tool-image?path=${encodeURIComponent(file)}`)).status, 401);
});
