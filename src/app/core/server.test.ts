// API のテスト: 認証・本文の読み取り・URL の :id の引き当て・リアルタイム配信（SSE）・サーバーの停止・画面の配信。ほかの領域は各機能の core/routes.test.ts（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { test } from "vitest";
import { startHttpServer, stopHttpServer } from "@/foundation/core/http/httpServer";
import { readIndexHtml } from "@/foundation/core/http/static";
import { AUTH, TOKEN, setup } from "@/app/core/testing/testServer";
import { openSse, sseType } from "@/foundation/core/testing/sse";
import { tempDir } from "@/foundation/core/testing/tempDir";
import type { ServerHello } from "@shared/foundation/server";
import { makeEvent } from "@shared/chat/testing";
import { API_MISMATCH_LABELS, API_VERSION, API_VERSION_HEADER, MIN_CLIENT_API_VERSION } from "@shared/foundation/api/version";

test("API はトークン（Bearer・Cookie）がないと 401", async () => {
  const { app, project } = setup();
  assert.equal((await app.request("/api/projects")).status, 401);
  const ok = await app.request("/api/projects", { headers: AUTH });
  assert.deepEqual(((await ok.json()) as { id: number }[]).map((p) => p.id), [project.id]);
  assert.equal((await app.request("/api/projects", { headers: { cookie: `kickoff_token=${TOKEN}` } })).status, 200);
});

test("図の枠のページ（/visual-frame）は認証の外で、図だけの CSP（通信しない）と no-store で返す", async () => {
  const { app } = setup();
  const res = await app.request("/visual-frame");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'none'.*connect-src 'none'/);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(await res.text(), /kickoff-visual-ready/);
});

test("本文が JSON として読めない・必須の本文が空なら 400（読み取りの失敗を 500 にしない）。省ける項目だけなら本文なしで呼べる", async () => {
  const { app, project } = setup();
  const send = (method: string, url: string, body: string) => app.request(url, { method, headers: { ...AUTH, "content-type": "application/json" }, body });
  const broken = await send("POST", `/api/projects/${project.id}/chats`, "{text:");
  assert.equal(broken.status, 400);
  assert.deepEqual(await broken.json(), { error: "本文が JSON として読めません" });
  assert.equal((await send("PUT", "/api/settings", "not json")).status, 400);
  // 必須の項目がある本文を空で送る
  const empty = await send("POST", `/api/projects/${project.id}/groups`, "");
  assert.equal(empty.status, 400);
  assert.equal((await empty.json()).error, "入力が正しくありません");
  // 省ける項目だけの本文は、空でも受け付ける
  assert.equal((await send("PUT", "/api/settings", "")).status, 200);
});

test("URL の :id は正の整数でなければ 400（クエリの ID と同じ）、なければ 404。どのルートも同じ引き当て", async () => {
  const { call, api, project } = setup();
  for (const url of ["/api/projects/abc/chats", "/api/projects/1.5/chats", "/api/projects/0/chats", "/api/chats/x", "/api/projects/abc/git/status", "/api/projects/-1/chats"]) {
    assert.deepEqual(await call("GET", url), { status: 400, body: { error: "ID の指定が正しくありません" } }, url);
  }
  assert.equal((await api("PATCH /api/groups/:groupId", { params: { groupId: "x" }, body: { name: "g" } })).status, 400);
  assert.equal((await call("POST", "/api/chats/x/queue", { text: "a" })).status, 400);
  assert.deepEqual(await api("GET /api/projects/:projectId/git/status", { params: { projectId: 999 } }), { status: 404, body: { error: "プロジェクトが見つかりません" } });
  assert.deepEqual(await api("DELETE /api/groups/:groupId", { params: { groupId: 999 } }), { status: 404, body: { error: "グループが見つかりません" } });
  assert.deepEqual(await api("POST /api/chats/:chatId/cancel", { params: { chatId: 999 } }), { status: 404, body: { error: "チャットが見つかりません" } });
  assert.equal((await api("GET /api/projects/:projectId/chats", { params: { projectId: project.id } })).status, 200);
});

test("リアルタイム配信（SSE）は、つないだらすぐ最初の行 hello（本体の版・API の版・本体の ID）を送る", async () => {
  const { app, store } = setup();
  const sse = await openSse(app, AUTH);
  assert.equal(sse.response.headers.get("content-type"), "text/event-stream");
  assert.equal(sse.first?.event, "hello", "最初の行が届きませんでした");
  const hello: ServerHello = { core_version: "0.1.0", api_version: API_VERSION, min_client_api_version: MIN_CLIENT_API_VERSION, host_id: store.databaseId };
  assert.deepEqual(sse.first?.data, hello);
});

test("SSE: 書いている途中の返答を続けて流すと 1 通（つないだ文）で届き、そのあとの記録の知らせより前に来る（バスでまとめる。窓がいくつでも同じ）", async () => {
  const { app, bus, project } = setup();
  const windows = [await openSse(app, AUTH), await openSse(app, AUTH)];
  for (const text of ["こん", "にち", "は"]) bus.publish({ type: "chat_delta", project_id: project.id, chat_id: 7, text });
  bus.publish({ type: "chat_event", project_id: project.id, event: makeEvent(1, "text", { text: "こんにちは" }, { chat_id: 7 }) });
  for (const sse of windows) {
    const events = (await sse.read((m) => sseType(m) === "chat_event")).map((m) => m.data as { type: string; text?: string });
    assert.deepEqual(
      events.map((e) => (e.type === "chat_delta" ? `delta:${e.text}` : e.type)),
      ["delta:こんにちは", "chat_event"],
    );
  }
});

test("サーバーを止めるときは、開いたままのリアルタイム配信の接続も切る（終了が止まらない）", async () => {
  const { app } = setup();
  const server = await startHttpServer(app, { port: 0, host: "127.0.0.1" });
  const { port } = server.address() as AddressInfo;
  // 応答ヘッダーがすぐ届く（届かないと fetch が返らない）
  const sse = await openSse({ request: (url, init) => fetch(`http://127.0.0.1:${port}${url}`, init) }, AUTH);
  assert.equal(sse.response.status, 200);
  assert.equal(sse.first?.event, "hello");
  const stopped = await Promise.race([stopHttpServer(server).then(() => "stopped"), new Promise((r) => setTimeout(() => r("timeout"), 2000))]);
  assert.equal(stopped, "stopped");
});

test("画面のファイル: /assets/ の下は 1 年・変わらない（ETag なし）、index.html と SPA のパスは no-cache と ETag で、同じ ETag なら 304。ない JS・CSS は 404、ほかのパスは index.html", async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>Kickoff</title>");
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "assets", "index-abc.js"), "console.log(1)");
  const { app } = setup({ staticDir: dir });
  const asset = await app.request("/assets/index-abc.js");
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(asset.headers.get("etag"), null);
  const etags = new Set<string>();
  for (const url of ["/", "/projects/1"]) {
    const res = await app.request(url);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers.get("cache-control"), "no-cache", url);
    const tag = res.headers.get("etag");
    assert.ok(tag, url);
    etags.add(tag);
    // 同じ ETag で問い合わせたら 304（本文なし・毎回確かめる）
    const again = await app.request(url, { headers: { "if-none-match": tag } });
    assert.equal(again.status, 304, url);
    assert.equal(await again.text(), "", url);
    assert.equal(again.headers.get("cache-control"), "no-cache", url);
  }
  assert.match(await (await app.request("/projects/1")).text(), /<title>Kickoff<\/title>/);
  assert.equal((await app.request("/assets/index-old.js")).status, 404);
  // 入れ替えて index.html の中身が変わったら、前の ETag では 304 にならず、新しい中身と別の ETag
  fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>Kickoff 2</title>");
  const replaced = setup({ staticDir: dir }).app;
  for (const url of ["/", "/projects/1"]) {
    const res = await replaced.request(url, { headers: { "if-none-match": [...etags].join(", ") } });
    assert.equal(res.status, 200, url);
    assert.ok(!etags.has(res.headers.get("etag") ?? ""), url);
    assert.match(await res.text(), /Kickoff 2/, url);
  }
  // API の応答は変えない
  const api = await app.request("/api/status", { headers: AUTH });
  assert.equal(api.status, 200);
  assert.equal(api.headers.get("cache-control"), null);
  // 知らない API は index.html ではなく JSON の 404
  for (const method of ["GET", "POST"]) {
    const unknown = await app.request("/api/no-such-api", { method, headers: AUTH });
    assert.equal(unknown.status, 404, method);
    assert.deepEqual(await unknown.json(), { error: "API が見つかりません" }, method);
  }
});

test("知らない API は JSON の 404（画面を配信していないときも）。トークンがなければ先に 401", async () => {
  const { app } = setup();
  const res = await app.request("/api/no-such-api", { headers: AUTH });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "API が見つかりません" });
  assert.equal((await app.request("/api/no-such-api")).status, 401);
});

test("版の互換: アプリが伝えた API の版が下限より古ければ、認証より前に 426 と client_too_old で断る。見出しがなければ断らない。状態にも API の版", async () => {
  const { app } = setup();
  const old = await app.request("/api/status", { headers: { ...AUTH, [API_VERSION_HEADER]: String(MIN_CLIENT_API_VERSION - 1) } });
  assert.equal(old.status, 426);
  assert.deepEqual(await old.json(), { error: API_MISMATCH_LABELS.client_too_old, code: "client_too_old", api_version: API_VERSION, min_client_api_version: MIN_CLIENT_API_VERSION });
  // トークンがなくても同じ印（ペアリングの前のアプリにも分かるように）
  assert.equal((await app.request("/pairing/claim", { method: "POST", headers: { [API_VERSION_HEADER]: "0" } })).status, 426);
  assert.equal((await app.request("/api/status", { headers: { ...AUTH, [API_VERSION_HEADER]: "abc" } })).status, 426);
  const ok = await app.request("/api/status", { headers: { ...AUTH, [API_VERSION_HEADER]: String(API_VERSION) } });
  assert.equal(ok.status, 200);
  const status = (await ok.json()) as { api_version: number; min_client_api_version: number };
  assert.deepEqual([status.api_version, status.min_client_api_version], [API_VERSION, MIN_CLIENT_API_VERSION]);
  assert.equal((await app.request("/api/status", { headers: AUTH })).status, 200);
});

test("ブラウザのログイン: 一度だけの番号で本体のトークンの Cookie を置いて画面へ。使った番号・知らない番号は 401", async () => {
  const { app, browserLogin } = setup();
  const code = browserLogin.issue();
  const ok = await app.request(`/login?code=${code}`);
  assert.equal(ok.status, 302);
  assert.match(ok.headers.get("set-cookie") ?? "", /^kickoff_token=t+;.*HttpOnly/i);
  assert.equal((await app.request(`/login?code=${code}`)).status, 401);
  assert.equal((await app.request("/login?code=nope")).status, 401);
});

test("画面のファイル（index.html）を読めなければ、場所の分かる文で起動を失敗にする（黙って画面を配らないと窓が真っ暗のまま）", () => {
  const dir = tempDir();
  assert.throws(() => readIndexHtml(dir), /画面のファイル（.*index\.html）を読めません/);
  assert.throws(() => readIndexHtml(path.join(dir, "ない")), /を読めません/);
  fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html>");
  assert.equal(readIndexHtml(dir), "<!doctype html>");
});
