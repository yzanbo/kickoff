// 端末に開く口は書いたものだけ: 全部の機能を組み立てたアプリで、端末のトークンで閉じた口・DB の口が 403 になり、開いた口の表がいまあるルートと合う
// （機能ごとの端末の振る舞いは features/devices/core/routes.test.ts）
import assert from "node:assert/strict";
import { test } from "vitest";
import { DEVICE_FORBIDDEN } from "@shared/foundation/api/deviceRefusals";
import { deviceRoutes } from "@/foundation/core/http/deviceAccess";
import { matchRecord } from "@/foundation/core/testing/record";
import { AUTH, setup } from "@/app/core/testing/testServer";

const DEVICE_TOKEN = "d".repeat(43);
const DEVICE = { authorization: `Bearer ${DEVICE_TOKEN}` };

/** スマホ連携をオンにして端末を 1 つつないだ、全部の機能のアプリ */
function withDevice() {
  const ctx = setup();
  ctx.store.settings.update({ mobile_enabled: true });
  ctx.store.devices.create("Pixel 8", DEVICE_TOKEN);
  return ctx;
}

test("端末: 開いた口だけ使え、ほかは 403 と印で断る（DB・Docker・GitHub・CI・ポート・設定・ファイル・Git も）", async () => {
  const { app, project } = withDevice();
  for (const url of ["/api/status", "/api/projects", `/api/projects/${project.id}/chats`, `/api/projects/${project.id}/notes`, "/api/approvals"]) {
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
  // 似た形の口でも、書いたものだけ（送信待ちの「すぐ送る」は開き、分岐・巻き戻しは閉じる）
  assert.notEqual((await app.request("/api/chats/999/queue/send", { method: "POST", headers: DEVICE })).status, 403);
  assert.equal((await app.request("/api/chats/999/fork", { method: "POST", headers: DEVICE })).status, 403);
  assert.equal((await app.request("/api/chats/999/rewind", { method: "POST", headers: DEVICE })).status, 403);
});

test("端末: DB のルートはどれも端末に開かない（403 と印。LAN は暗号化なしなので、接続の情報・SQL を端末に通さない）", async () => {
  const { app, project } = withDevice();
  const keys = app.routes.filter((r) => r.method !== "ALL" && (r.path.includes("/db-connections") || r.path.endsWith("/docker/db"))).map((r) => `${r.method} ${r.path}`);
  const dbRoutes = [...new Set(keys)].map((k) => ({ method: k.slice(0, k.indexOf(" ")), path: k.slice(k.indexOf(" ") + 1) }));
  // 取り決めに乗せ替えても、数え漏れで素通りしないように（いまは 42 本 = 接続の 41 本と Docker の「DB で開く」）
  assert.ok(dbRoutes.length >= 42, `DB のルートが ${dbRoutes.length} 本しか見つかりません`);
  for (const { method, path: route } of dbRoutes) {
    const url = route.replace(/:\w+/g, String(project.id));
    const res = await app.request(url, { method, headers: DEVICE });
    assert.equal(res.status, 403, `${method} ${route}`);
    assert.equal(((await res.json()) as { code: string }).code, DEVICE_FORBIDDEN, `${method} ${route}`);
  }
});

test("端末に開く口の記録（取り決めの access と、まだ乗せていない口の表を合わせたもの。どれもいまあるルート）", async () => {
  const { app, routes } = setup();
  const existing = new Set(app.routes.filter((r) => r.method !== "ALL").map((r) => `${r.method} ${r.path}`));
  const open = deviceRoutes(routes);
  for (const { method, path } of open) assert.ok(existing.has(`${method} ${path}`), `${method} ${path} がありません`);
  // 開け忘れ・閉め忘れは記録の差分で見える
  await matchRecord("__snapshots__/device-routes.txt", `${open.map((r) => `${r.method} ${r.path} ${r.access}`).sort().join("\n")}\n`);
});
