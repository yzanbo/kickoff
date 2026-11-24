// API のテスト: チャットの AI まわり（作業フォルダが変わったときのセッション・添付・承認依頼・プロバイダー・使用枠・/ のコマンド・既定の推論の深さ・Claude Code 以外の AI）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test, vi } from "vitest";
import { PROVIDER_IDS } from "@shared/settings/types";
import { AUTH, setup, until } from "@/app/core/testing/testServer";
import { tempDir } from "@/foundation/core/testing/tempDir";

test("作業フォルダが変わると（別のプロジェクトへ移す）: 会話を新しいセッションに写して区切りを置く。区切りより前へは巻き戻し・分岐・ファイルを戻すができず、移したあと最初の実行にだけ知らせを添える（0025）", async () => {
  const { api, project, store, runner, provider } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "こんにちは" } })).body.id;
  await until(() => !runner.isBusy(chatId));
  const firstUser = store.events.list(chatId).find((e) => e.type === "user")!;
  const firstResult = store.events.list(chatId).find((e) => e.type === "result")!;

  const moved = await api("POST /api/chats/:chatId/move", { params: { chatId: chatId }, body: { project_id: other.id } });
  assert.equal(moved.body.session_id, "moved-1");
  assert.deepEqual(provider.copies, [["s1", project.repo_path]]);
  const boundary = store.events.list(chatId).find((e) => e.type === "workplace_moved");
  assert.ok(boundary?.type === "workplace_moved");
  assert.deepEqual(
    [boundary.data.reason, boundary.data.from.project_id, boundary.data.to.project_id, boundary.data.to.dir, boundary.data.session_id, boundary.data.message_id],
    ["project_moved", project.id, other.id, other.repo_path, "moved-1", "m1"],
  );
  // 記録の作業の終わりも新しいセッションを指す（古い会話記録はどのチャットも使わない）
  const remapped = store.events.list(chatId).find((e) => e.id === firstResult.id);
  assert.equal(remapped?.type === "result" ? remapped.data.session_id : null, "moved-1");
  assert.equal(store.events.sessionInUse("s1"), false);

  // 区切りより前へは巻き戻せない・分岐できない・ファイルを戻せない
  assert.deepEqual(await api("POST /api/chats/:chatId/rewind", { params: { chatId: chatId }, body: { event_id: firstUser.id, text: "やり直し" } }), { status: 400, body: { error: "作業場所を移す前の発言なので巻き戻せません（会話もファイルも）" } });
  assert.equal((await api("POST /api/chats/:chatId/fork", { params: { chatId: chatId }, body: { event_id: firstResult.id } })).status, 400);
  assert.equal((await api("POST /api/chats/:chatId/rewind-files", { params: { chatId: chatId }, body: { event_id: firstUser.id, dry_run: true } })).status, 400);

  // 移したあと最初の実行にだけ、移動の知らせを添える。続きは写した会話から
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "続き" } });
  await until(() => !runner.isBusy(chatId));
  assert.match(provider.lastTurnContext ?? "", /作業場所が変わりました（チャットを別のプロジェクトへ移しました）/);
  assert.equal(provider.resumes.at(-1), "moved-1");
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "さらに続き" } });
  await until(() => !runner.isBusy(chatId));
  assert.equal(provider.lastTurnContext, null);

  // Kickoff が自動で変えるときは、写せなくても移す（会話はいまのセッションのまま）
  provider.copyError = "壊れた記録";
  const back = await api("POST /api/chats/:chatId/move", { params: { chatId: chatId }, body: { project_id: project.id } });
  assert.equal(back.status, 200);
  assert.equal(back.body.project_id, project.id);
  assert.equal(store.events.list(chatId).filter((e) => e.type === "workplace_moved").length, 2);
});

test("添付・承認依頼・プロバイダー・使用枠の API", async () => {
  const { app, call, api, approvals, project } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
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

  assert.deepEqual((await api("GET /api/approvals")).body, []);
  // もう待っていない（回答済み・中断済み）依頼は 409（状態による失敗。404 にしない）
  assert.deepEqual(await api("POST /api/approvals/:approvalId", { params: { approvalId: "nope" }, body: { action: "allow" } }), {
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
  const listed = (await api("GET /api/approvals")).body as { tool_use_id?: string; agent_id?: string }[];
  assert.deepEqual([listed[0]?.tool_use_id, listed[0]?.agent_id], ["tq", "a1b2"]);
  const answered = await call("POST", `/api/approvals/${question.approval.id}`, {
    action: "answer",
    answers: { Q: "この画像のように" },
    attachments: { Q: [saved, { kind: "file", id: randomUUID(), name: "missing.png", mime: "image/png", size: 1 }] },
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

  // 「覚える」の範囲（書き込み先の守りの「このチャットでは許可」）を一覧に出す。省いたら出さない（画面は「常に許可」）
  const scoped = approvals.request(
    { chatId: 1, projectId: project.id },
    { kind: "permission", toolName: "Write", input: { file_path: "/tmp/x" }, canRemember: true, rememberScope: "chat" },
    new AbortController().signal,
  );
  const scopedListed = (await api("GET /api/approvals")).body as { id: string; remember_scope?: string }[];
  assert.equal(scopedListed.find((a) => a.id === scoped.approval.id)?.remember_scope, "chat");
  assert.equal((await api("POST /api/approvals/:approvalId", { params: { approvalId: scoped.approval.id }, body: { action: "allow_always" } })).status, 204);
  assert.equal((await scoped.decision).action, "allow_always");

  assert.equal((await call("GET", "/api/providers")).body.length, PROVIDER_IDS.length);
  assert.deepEqual((await call("GET", "/api/providers/claude/models")).body, []);
  assert.equal((await call("GET", "/api/providers/unknown/models")).status, 400);
  assert.deepEqual((await api("GET /api/usage", { query: { provider: "claude" } })).body.map((u: { provider: string; status: string }) => [u.provider, u.status]), [["claude", "unavailable"]]); // テストの Claude の枠は取れない
  assert.equal((await api("POST /api/usage/refresh", { body: { provider: "claude" } })).body[0].status, "unavailable");
});

test("チャット欄の / のコマンド: プロジェクトの作業場所で調べる。プロジェクトがなければ 404", async () => {
  const { call, project, provider } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  provider.commandList = [{ name: "review", description: "コードを見直す", argument_hint: "" }];
  const res = await call("GET", `/api/projects/${project.id}/commands`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, provider.commandList);
  assert.equal(provider.lastCommandsCwd, project.repo_path);
  assert.equal((await call("GET", "/api/projects/999/commands")).status, 404);
});

test("既定の推論の深さの API: 作業フォルダの Claude Code の設定から求める", async () => {
  // 環境変数で決めている環境ではそちらが先になるので、どの環境でも設定のファイルから求めるよう外す
  vi.stubEnv("CLAUDE_CODE_EFFORT_LEVEL", undefined);
  const { call, project } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  fs.mkdirSync(path.join(project.repo_path, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(project.repo_path, ".claude", "settings.local.json"), JSON.stringify({ modelSettings: { "claude-opus-5": { effortLevel: "high" } } }));
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/effort-default?model=claude-opus-5`)).body, { effort: "high", source: "local" });
  assert.equal((await call("GET", "/api/projects/999/effort-default")).status, 404);
});

test("Claude Code 以外の AI のチャット: Claude Code の既定（モデル・深さ・権限）を当てず、その AI の一覧にないモデルは外して動かす（メモの仕様書「0028」の G1・G2）", async () => {
  const { api, project, runner, provider, store } = setup({ features: ["chat", "childChats", "settings", "workplaceMove"] });
  store.settings.update({ provider_chat_defaults: { claude: { model: "opus", effort: "high", permission_mode: "auto", fast_mode: false } } });
  const plain = await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1", provider: "codex" } });
  assert.equal(plain.status, 201);
  assert.deepEqual([plain.body.provider, plain.body.model, plain.body.effort, plain.body.permission_mode], ["codex", null, null, "default"]);
  await until(() => !runner.isBusy(plain.body.id));

  // 一覧があれば、ほかの AI のモデルの名前は作るときに外す（一覧にあるものはそのまま）
  provider.models = async () => [{ value: "gpt-6-luna", label: "GPT-6 Luna", description: "", efforts: ["low"], supports_auto_mode: true, supports_fast_mode: false, is_default: true }];
  const wrong = await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "2", provider: "codex", options: { model: "opus" } } });
  assert.equal(wrong.body.model, null);
  await until(() => !runner.isBusy(wrong.body.id));
  const right = await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "3", provider: "codex", options: { model: "gpt-6-luna" } } });
  assert.equal(right.body.model, "gpt-6-luna");
  await until(() => !runner.isBusy(right.body.id));

  // 一覧にない名前のまま残っているチャットも、送るときに外して動かし、チャットにも直して残す
  const old = store.chats.create({ project_id: project.id, provider: "codex", title: "old", status: "completed", model: "opus" });
  assert.equal((await api("POST /api/chats/:chatId/messages", { params: { chatId: old.id }, body: { text: "続き" } })).status, 200);
  await until(() => !runner.isBusy(old.id));
  assert.equal(provider.lastModel, null);
  assert.equal(store.chats.get(old.id)?.model, null);
});
