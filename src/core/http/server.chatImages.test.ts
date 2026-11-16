// API のテスト: チャット欄の外の画像（表示を許可したホスト・許可したホストの画像・分岐で写す・本当に消すと片付く。共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import type { BusEvent } from "@shared/types";
import { AUTH, setup, until } from "../testing/testServer.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/** チャットを 1 つ作って作業の終わりまで待つ */
async function chatOf(ctx: ReturnType<typeof setup>) {
  const id = (await ctx.call("POST", `/api/projects/${ctx.project.id}/chats`, { text: "画像を見せて" })).body.id as number;
  await until(() => ctx.store.chats.get(id)?.status === "completed");
  return id;
}

const imageUrl = (chatId: number, url: string) => `/api/chats/${chatId}/remote-image?url=${encodeURIComponent(url)}`;

test("表示を許可したホスト: 許可・一覧・取り消し（小文字にそろえ、変わるたびに chat_image_hosts を知らせる）", async () => {
  const ctx = setup();
  const { call, bus } = ctx;
  const chatId = await chatOf(ctx);
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));

  assert.deepEqual((await call("GET", `/api/chats/${chatId}/image-hosts`)).body, { hosts: [] });
  const allowed = await call("PUT", `/api/chats/${chatId}/image-hosts`, { host: "Example.COM" });
  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.body.hosts.map((h: { host: string }) => h.host), ["example.com"]);
  // 2 回押しても 1 つ
  await call("PUT", `/api/chats/${chatId}/image-hosts`, { host: "example.com" });
  assert.equal((await call("GET", `/api/chats/${chatId}/image-hosts`)).body.hosts.length, 1);
  const changed = events.filter((e) => e.type === "chat_image_hosts");
  assert.equal(changed.length, 2);
  assert.equal(changed[0].type === "chat_image_hosts" && changed[0].chat_id, chatId);

  const revoked = await call("DELETE", `/api/chats/${chatId}/image-hosts?host=example.com`);
  assert.deepEqual(revoked.body, { hosts: [] });
  // 使えないホストの名前・ないチャット
  assert.equal((await call("PUT", `/api/chats/${chatId}/image-hosts`, { host: "a b" })).status, 400);
  assert.equal((await call("GET", "/api/chats/999/image-hosts")).status, 404);
});

test("許可したホストの画像だけを返し、2 回目からは覚えた画像を返す（取り消すと覚えも消える）", async () => {
  const ctx = setup();
  const { app, call, imageFake } = ctx;
  const chatId = await chatOf(ctx);
  const url = "https://images.example.com/a.png";
  imageFake.images[url] = { contentType: "image/png", body: PNG };

  // 許可していなければ取りに行かない
  const denied = await app.request(imageUrl(chatId, url), { headers: AUTH });
  assert.equal(denied.status, 400);
  assert.match((await denied.json()).error, /images\.example\.com の画像の表示を許可していません/);
  assert.deepEqual(imageFake.fetched, []);

  await call("PUT", `/api/chats/${chatId}/image-hosts`, { host: "images.example.com" });
  const first = await app.request(imageUrl(chatId, url), { headers: AUTH });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("content-type"), "image/png");
  assert.equal(first.headers.get("content-security-policy"), "sandbox");
  assert.equal(first.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await first.arrayBuffer()), PNG);
  const second = await app.request(imageUrl(chatId, url), { headers: AUTH });
  assert.deepEqual(Buffer.from(await second.arrayBuffer()), PNG);
  assert.deepEqual(imageFake.fetched, [url]);

  // http(s) でないもの・読めないものは断る
  assert.equal((await app.request(imageUrl(chatId, "data:image/png;base64,AAAA"), { headers: AUTH })).status, 400);
  // 相手が 404 なら 400 と理由
  const missing = await app.request(imageUrl(chatId, "https://images.example.com/none.png"), { headers: AUTH });
  assert.equal(missing.status, 400);

  // 取り消すと許可も覚えも消え、もう返さない
  await call("DELETE", `/api/chats/${chatId}/image-hosts?host=images.example.com`);
  assert.equal(ctx.store.chatImages.cached(chatId, "x"), undefined);
  assert.equal(ctx.store.chatImages.totalSize(), 0);
  assert.equal((await app.request(imageUrl(chatId, url), { headers: AUTH })).status, 400);
});

test("分岐すると、表示の許可と覚えた画像を新しいチャットに写す（取りに行き直さない）", async () => {
  const ctx = setup();
  const { app, call, store, imageFake } = ctx;
  const chatId = await chatOf(ctx);
  const url = "https://images.example.com/b.png";
  imageFake.images[url] = { contentType: "image/png", body: PNG };
  await call("PUT", `/api/chats/${chatId}/image-hosts`, { host: "images.example.com" });
  await app.request(imageUrl(chatId, url), { headers: AUTH });

  const result = store.events.list(chatId).find((e) => e.type === "result")!;
  const forked = await call("POST", `/api/chats/${chatId}/fork`, { event_id: result.id });
  assert.equal(forked.status, 201);
  assert.deepEqual((await call("GET", `/api/chats/${forked.body.id}/image-hosts`)).body.hosts.map((h: { host: string }) => h.host), ["images.example.com"]);
  const copied = await app.request(imageUrl(forked.body.id, url), { headers: AUTH });
  assert.deepEqual(Buffer.from(await copied.arrayBuffer()), PNG);
  assert.deepEqual(imageFake.fetched, [url]);
});

test("チャットを本当に消すと、表示の許可と覚えた画像のフォルダも消える", async () => {
  const ctx = setup();
  const { app, call, store, imageFake, remoteImages, trashBin, trashClock } = ctx;
  const chatId = await chatOf(ctx);
  const url = "https://images.example.com/c.png";
  imageFake.images[url] = { contentType: "image/png", body: PNG };
  await call("PUT", `/api/chats/${chatId}/image-hosts`, { host: "images.example.com" });
  await app.request(imageUrl(chatId, url), { headers: AUTH });
  const folder = path.join(remoteImages.dir, String(chatId));
  assert.equal(fs.existsSync(folder), true);

  assert.equal((await call("DELETE", `/api/chats/${chatId}`)).status, 200);
  trashClock.now += 4 * 24 * 60 * 60 * 1000;
  await trashBin.sweep();
  assert.equal(fs.existsSync(folder), false);
  assert.deepEqual(store.chatImages.hosts(chatId), []);
});

test("手元の画像（返答の `![](docs/a.png)`）は、相対パスならチャットの作業場所から読む（作業場所の外は断る）", async () => {
  const ctx = setup();
  const { app, project } = ctx;
  const chatId = await chatOf(ctx);
  fs.mkdirSync(path.join(project.repo_path, "docs"), { recursive: true });
  fs.writeFileSync(path.join(project.repo_path, "docs", "a.png"), PNG);
  const res = await app.request(`/api/chats/${chatId}/tool-image?path=${encodeURIComponent("docs/a.png")}`, { headers: AUTH });
  assert.equal(res.status, 200);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);
  const outside = await app.request(`/api/chats/${chatId}/tool-image?path=${encodeURIComponent("../../outside.png")}`, { headers: AUTH });
  assert.equal(outside.status, 400);
});
