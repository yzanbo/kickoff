// API のテスト: 呼び主（この Mac / 端末）と、端末に開く口・届ける知らせ（既定で閉じる）
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEVICE_FORBIDDEN } from "@shared/types";
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
