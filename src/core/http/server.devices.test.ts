// API のテスト: 呼び主（この Mac / 端末）と、端末に開く口・届ける知らせ（既定で閉じる）
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEVICE_FORBIDDEN, type Device, type PairingClaimResult, type PairingPollResult, type PairingState } from "@shared/types";
import { hashToken } from "./caller.js";
import { DEVICE_ROUTES } from "./deviceAccess.js";
import { AUTH, setup } from "../testing/testServer.js";

const DEVICE_TOKEN = "d".repeat(43);
const DEVICE = { authorization: `Bearer ${DEVICE_TOKEN}` };

function withDevice() {
  const ctx = setup();
  const device = ctx.store.devices.create("Pixel 8", hashToken(DEVICE_TOKEN));
  return { ...ctx, device };
}

test("端末: 開いた口だけ使え、ほかは 403 と印で断る（DB・Docker・GitHub・CI・ポート・設定・ファイル・Git も）", async () => {
  const { app, project } = withDevice();
  for (const url of ["/api/status", "/api/projects", `/api/projects/${project.id}/chats`, `/api/projects/${project.id}/memos`, "/api/approvals"]) {
    assert.equal((await app.request(url, { headers: DEVICE })).status, 200, url);
  }
  const closed = [
    `/api/projects/${project.id}/db-connections`,
    `/api/projects/${project.id}/docker`,
    `/api/projects/${project.id}/github/connection`,
    `/api/projects/${project.id}/ci/runs`,
    "/api/ports",
    "/api/settings",
    `/api/projects/${project.id}/files`,
    `/api/projects/${project.id}/git/status`,
  ];
  for (const url of closed) {
    const res = await app.request(url, { headers: DEVICE });
    assert.equal(res.status, 403, url);
    assert.equal(((await res.json()) as { code: string }).code, DEVICE_FORBIDDEN, url);
    // この Mac（本体のトークン）なら 403 にはしない
    assert.notEqual((await app.request(url, { headers: AUTH })).status, 403, url);
  }
  // 開いた口でも、書いていないメソッドは断る（プロジェクトを消す・変える）
  assert.equal((await app.request(`/api/projects/${project.id}`, { method: "DELETE", headers: DEVICE })).status, 403);
  assert.equal((await app.request(`/api/projects/${project.id}`, { method: "PATCH", headers: DEVICE })).status, 403);
  // 似た形の口でも、書いたものだけ（送信待ちの「すべて送る」は開き、分岐・巻き戻しは閉じる）
  assert.notEqual((await app.request("/api/chats/999/queue/send-all", { method: "POST", headers: DEVICE })).status, 403);
  assert.equal((await app.request("/api/chats/999/fork", { method: "POST", headers: DEVICE })).status, 403);
  assert.equal((await app.request("/api/chats/999/rewind", { method: "POST", headers: DEVICE })).status, 403);
});

test("端末: 知らないトークン・取り消した端末は 401。Tailscale などの見出しでは呼び主にならない。使ったら最後に使った時刻を書く", async () => {
  const { app, store, device } = withDevice();
  assert.equal(store.devices.get(device.id)!.last_used_at, null);
  assert.equal((await app.request("/api/status", { headers: DEVICE })).status, 200);
  assert.ok(store.devices.get(device.id)!.last_used_at);
  assert.equal((await app.request("/api/status", { headers: { authorization: "Bearer nope" } })).status, 401);
  const forwarded = { "tailscale-user-login": "someone@example.com", "x-forwarded-for": "127.0.0.1" };
  assert.equal((await app.request("/api/status", { headers: forwarded })).status, 401);
  // Cookie で来ても同じ（iPhone の Web は Cookie で持つ）
  assert.equal((await app.request("/api/status", { headers: { cookie: `kickoff_token=${DEVICE_TOKEN}` } })).status, 200);
  store.devices.remove(device.id);
  assert.equal((await app.request("/api/status", { headers: DEVICE })).status, 401);
});

test("端末に開く口は、どれもいまあるルート（名前を変えたら、端末に開く口の一覧も直す）", () => {
  const { app } = setup();
  const routes = new Set(app.routes.filter((r) => r.method !== "ALL").map((r) => `${r.method} ${r.path}`));
  for (const [method, path] of DEVICE_ROUTES) assert.ok(routes.has(`${method} ${path}`), `${method} ${path} がありません`);
});

test("SSE: 端末には開いた口の知らせだけを届け、この Mac の画面への頼み・閉じた口の知らせは届けない", async () => {
  const { app, bus, project } = withDevice();
  const read = async (headers: Record<string, string>) => {
    const res = await app.request("/api/events", { headers });
    const reader = res.body!.getReader();
    await reader.read(); // 最初の ping
    bus.publish({ type: "ports_changed", count: 1, fresh: 0 });
    bus.publish({ type: "docker_changed", project_id: project.id });
    bus.publish({ type: "memos", project_id: project.id, path: null });
    const chunk = await Promise.race([reader.read(), new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 1000))]);
    await reader.cancel();
    return chunk === "timeout" ? "" : new TextDecoder().decode(chunk.value);
  };
  const deviceText = await read(DEVICE);
  assert.match(deviceText, /"type":"memos"/);
  assert.doesNotMatch(deviceText, /ports_changed|docker_changed/);
  // この Mac の画面にはすべて届く
  assert.match(await read(AUTH), /ports_changed/);
});

/** 番号で頼み、Mac で答え、結果を聞くまで（認証の外の口） */
async function claim(app: ReturnType<typeof setup>["app"], code: string, name = "Pixel 8") {
  const res = await app.request("/pairing/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, name }) });
  return { status: res.status, body: (await res.json()) as PairingClaimResult & { error?: string } };
}
async function poll(app: ReturnType<typeof setup>["app"], id: string, secret: string) {
  const res = await app.request(`/pairing/requests/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret }) });
  return (await res.json()) as PairingPollResult;
}

test("ペアリング: Mac が番号を出し、端末が頼み、Mac で「つなぐ」を押したら端末のトークンを 1 回だけ渡す。そのトークンで開いた口を使える", async () => {
  const { app, call, store, bus } = setup();
  const events: string[] = [];
  bus.subscribe((e) => events.push(e.type));
  await call("PUT", "/api/settings", { mobile_url: "https://mac.example.ts.net" });
  const started = (await call("POST", "/api/pairing")).body as PairingState;
  assert.match(started.code!, /^\d{6}$/);
  assert.equal(started.url, "https://mac.example.ts.net");
  assert.equal(started.host_id, store.databaseId);

  const claimed = await claim(app, started.code!);
  assert.equal(claimed.status, 201);
  assert.equal(claimed.body.host_id, store.databaseId);
  assert.deepEqual(await poll(app, claimed.body.request_id, claimed.body.secret), { status: "pending" });
  // 鍵が違えば何も分からない
  assert.deepEqual(await poll(app, claimed.body.request_id, "wrong"), { status: "expired" });
  const waiting = (await call("GET", "/api/pairing")).body as PairingState;
  assert.equal(waiting.request?.name, "Pixel 8");

  const approved = (await call("POST", `/api/pairing/requests/${claimed.body.request_id}/approve`)).body as PairingState;
  // 番号は使い終える
  assert.equal(approved.code, null);
  const result = await poll(app, claimed.body.request_id, claimed.body.secret);
  assert.equal(result.status, "approved");
  if (result.status !== "approved") return;
  // 2 回目は渡さない
  assert.deepEqual(await poll(app, claimed.body.request_id, claimed.body.secret), { status: "expired" });
  assert.equal((await app.request("/api/projects", { headers: { authorization: `Bearer ${result.token}` } })).status, 200);
  assert.equal((await app.request("/api/settings", { headers: { authorization: `Bearer ${result.token}` } })).status, 403);
  // 一覧に出し、トークンは出さない
  const devices = (await call("GET", "/api/devices")).body as Device[];
  assert.deepEqual(devices.map((d) => d.name), ["Pixel 8"]);
  assert.ok(!JSON.stringify(devices).includes(result.token));
  assert.ok(events.includes("pairing") && events.includes("devices"));

  // 取り消したら、そのトークンは使えない
  assert.equal((await call("DELETE", `/api/devices/${result.device_id}`)).status, 204);
  assert.equal((await app.request("/api/projects", { headers: { authorization: `Bearer ${result.token}` } })).status, 401);
  assert.equal((await call("DELETE", `/api/devices/${result.device_id}`)).status, 404);
});

test("ペアリング: 番号が違う・期限切れは断り、5 回続けて間違えたら番号を捨てる。断ったら端末には denied。ペアリングの口は端末には開かない", async () => {
  const { app, call, pairingClock } = setup();
  assert.equal((await claim(app, "123456")).status, 404);
  const { code } = (await call("POST", "/api/pairing")).body as PairingState;
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 4; i++) assert.equal((await claim(app, wrong)).status, 400);
  assert.equal((await claim(app, wrong)).status, 400);
  // 5 回目で捨てたので、正しい番号でも頼めない
  assert.equal((await claim(app, code!)).status, 404);

  const second = (await call("POST", "/api/pairing")).body as PairingState;
  const req = await claim(app, second.code!.replace(/(\d{3})/, "$1-"));
  assert.equal(req.status, 201, "区切りの - は読み飛ばす");
  // 確かめを待っている間は、ほかの端末は頼めない
  assert.equal((await claim(app, second.code!, "別の端末")).status, 409);
  await call("POST", `/api/pairing/requests/${req.body.request_id}/deny`);
  assert.deepEqual(await poll(app, req.body.request_id, req.body.secret), { status: "denied" });

  // 期限（5 分）を過ぎたら番号は消える
  pairingClock.now += 5 * 60_000 + 1;
  assert.equal(((await call("GET", "/api/pairing")).body as PairingState).code, null);
  assert.equal((await claim(app, second.code!)).status, 404);
});

test("ペアリング: つないだのに結果を聞かれないまま期限を過ぎたら、作った端末を消す", async () => {
  const { app, call, store, pairingClock } = setup();
  const { code } = (await call("POST", "/api/pairing")).body as PairingState;
  const req = await claim(app, code!);
  await call("POST", `/api/pairing/requests/${req.body.request_id}/approve`);
  assert.equal(store.devices.list().length, 1);
  pairingClock.now += 5 * 60_000 + 1;
  await call("GET", "/api/pairing");
  assert.equal(store.devices.list().length, 0);
});

test("ペアリングと端末の一覧の口は、端末には開かない", async () => {
  const { app } = withDevice();
  for (const [method, url] of [["GET", "/api/pairing"], ["POST", "/api/pairing"], ["GET", "/api/devices"], ["DELETE", "/api/devices/1"]] as const) {
    assert.equal((await app.request(url, { method, headers: DEVICE })).status, 403, `${method} ${url}`);
  }
});
