// API のテスト: 認証・リアルタイム配信（SSE）・サーバーの停止。ほかの領域は server.<領域>.test.ts（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { startHttpServer, stopHttpServer } from "./httpServer.js";
import { AUTH, TOKEN, setup, tempDir } from "../testing/testServer.js";

test("API はトークン（Bearer・Cookie）がないと 401。ペアリングで Cookie を渡す", async () => {
  const { app } = setup();
  assert.equal((await app.request("/api/health")).status, 401);
  const ok = await app.request("/api/health", { headers: AUTH });
  assert.deepEqual(await ok.json(), { ok: true, version: "0.1.0" });
  assert.equal((await app.request("/api/health", { headers: { cookie: `kickoff_token=${TOKEN}` } })).status, 200);

  assert.equal((await app.request("/pair?token=wrong")).status, 401);
  const paired = await app.request(`/pair?token=${TOKEN}`);
  assert.equal(paired.status, 302);
  assert.match(paired.headers.get("set-cookie") ?? "", /^kickoff_token=t+;/);
});

test("リアルタイム配信（SSE）は、つないだらすぐ最初の行を送る", async () => {
  const { app } = setup();
  const res = await app.request("/api/events", { headers: AUTH });
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const reader = res.body!.getReader();
  const first = await Promise.race([reader.read(), new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 1000))]);
  assert.notEqual(first, "timeout", "最初の行が届きませんでした");
  if (first !== "timeout") assert.equal(new TextDecoder().decode(first.value), "event: ping\ndata: \n\n");
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
});
