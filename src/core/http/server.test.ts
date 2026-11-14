// API のテスト: 認証・本文の読み取り・URL の :id の引き当て・リアルタイム配信（SSE）・サーバーの停止・画面の配信。ほかの領域は server.<領域>.test.ts（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { startHttpServer, stopHttpServer } from "./httpServer.js";
import { AUTH, TOKEN, setup } from "../testing/testServer.js";
import { tempDir } from "../testing/tempDir.js";
import type { ServerHello } from "@shared/types";
import { API_MISMATCH_LABELS, API_VERSION, API_VERSION_HEADER, MIN_CLIENT_API_VERSION } from "@shared/api/version";

test("API はトークン（Bearer・Cookie）がないと 401。本体のトークンを URL で渡す口（前の /pair?token=）はない", async () => {
  const { app } = setup();
  assert.equal((await app.request("/api/health")).status, 401);
  const ok = await app.request("/api/health", { headers: AUTH });
  assert.deepEqual(await ok.json(), { ok: true, version: "0.1.0" });
  assert.equal((await app.request("/api/health", { headers: { cookie: `kickoff_token=${TOKEN}` } })).status, 200);

  const old = await app.request(`/pair?token=${TOKEN}`);
  assert.equal(old.headers.get("set-cookie"), null);
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
  const { call, project } = setup();
  for (const url of ["/api/projects/abc", "/api/projects/1.5", "/api/projects/0", "/api/chats/x", "/api/projects/abc/git/status", "/api/projects/-1/chats"]) {
    assert.deepEqual(await call("GET", url), { status: 400, body: { error: "ID の指定が正しくありません" } }, url);
  }
  assert.equal((await call("PATCH", "/api/groups/x", { name: "g" })).status, 400);
  assert.equal((await call("POST", "/api/chats/x/queue", { text: "a" })).status, 400);
  assert.deepEqual(await call("GET", "/api/projects/999/git/status"), { status: 404, body: { error: "プロジェクトが見つかりません" } });
  assert.deepEqual(await call("DELETE", "/api/groups/999"), { status: 404, body: { error: "グループが見つかりません" } });
  assert.deepEqual(await call("POST", "/api/chats/999/cancel"), { status: 404, body: { error: "チャットが見つかりません" } });
  assert.equal((await call("GET", `/api/projects/${project.id}`)).status, 200);
});

test("リアルタイム配信（SSE）は、つないだらすぐ最初の行 hello（本体の版・API の版・本体の ID）を送る", async () => {
  const { app, store } = setup();
  const res = await app.request("/api/events", { headers: AUTH });
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const reader = res.body!.getReader();
  const first = await Promise.race([reader.read(), new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 1000))]);
  assert.notEqual(first, "timeout", "最初の行が届きませんでした");
  if (first !== "timeout") {
    const text = new TextDecoder().decode(first.value);
    assert.match(text, /^event: hello\ndata: /);
    const hello = JSON.parse(text.split("data: ")[1]) as ServerHello;
    assert.deepEqual(hello, { core_version: "0.1.0", api_version: API_VERSION, min_client_api_version: MIN_CLIENT_API_VERSION, host_id: store.databaseId });
  }
  await reader.cancel();
});

test("サーバーを止めるときは、開いたままのリアルタイム配信の接続も切る（終了が止まらない）", async () => {
  const { app } = setup();
  const server = await startHttpServer(app, { port: 0, host: "127.0.0.1" });
  const { port } = server.address() as AddressInfo;
  // 応答ヘッダーがすぐ届く（届かないと fetch が返らない）
  const res = await fetch(`http://127.0.0.1:${port}/api/events`, { headers: AUTH });
  assert.equal(res.status, 200);
  const reader = res.body!.getReader();
  await reader.read();
  const stopped = await Promise.race([stopHttpServer(server).then(() => "stopped"), new Promise((r) => setTimeout(() => r("timeout"), 2000))]);
  assert.equal(stopped, "stopped");
  await reader.cancel().catch(() => {});
});

test("画面のファイルは no-cache で返し（入れ替えたあとに古い画面を使わせない）、ない JS・CSS は 404、ほかのパスは index.html", async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>Kickoff</title>");
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "assets", "index-abc.js"), "console.log(1)");
  const { app } = setup({ staticDir: dir });
  for (const url of ["/", "/assets/index-abc.js", "/projects/1"]) {
    const res = await app.request(url);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers.get("cache-control"), "no-cache", url);
  }
  assert.match(await (await app.request("/projects/1")).text(), /<title>Kickoff<\/title>/);
  assert.equal((await app.request("/assets/index-old.js")).status, 404);
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
