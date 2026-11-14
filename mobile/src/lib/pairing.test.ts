import assert from "node:assert/strict";
import { test } from "node:test";
import { pairingLink } from "@shared/devices/pairing";
import { API_VERSION_HEADER } from "@shared/api/version";
import { ApiError, HostClient, withQuery } from "./client";
import { claimPairing, normalizeHostUrl, parsePairingLink } from "./pairing";
import { hostMismatch } from "./version";

test("parsePairingLink: 本体の画面の QR（pairingLink）を読み、つなぐ先・番号・本体の ID に分ける。ほかの QR・http は読まない", () => {
  const link = pairingLink("https://mac.tailnet.ts.net/", "123456", "host-1")!;
  assert.deepEqual(parsePairingLink(link), { url: "https://mac.tailnet.ts.net", code: "123456", host_id: "host-1" });
  // 開発版を別のポートで出したとき
  assert.deepEqual(parsePairingLink("https://mac.tailnet.ts.net:8443/pair?code=123-456&host=h"), { url: "https://mac.tailnet.ts.net:8443", code: "123456", host_id: "h" });
  assert.equal(parsePairingLink("http://mac.tailnet.ts.net/pair?code=123456"), null);
  assert.equal(parsePairingLink("https://example.com/other?code=123456"), null);
  assert.equal(parsePairingLink("https://mac.ts.net/pair?code=12"), null);
  assert.equal(parsePairingLink("not a url"), null);
});

test("normalizeHostUrl: https を補い、末尾の / を落とす。http は断る", () => {
  assert.equal(normalizeHostUrl("mac.tailnet.ts.net/"), "https://mac.tailnet.ts.net");
  assert.equal(normalizeHostUrl(" https://mac.tailnet.ts.net:8443 "), "https://mac.tailnet.ts.net:8443");
  assert.equal(normalizeHostUrl("http://192.168.1.2:4318"), null);
  assert.equal(normalizeHostUrl(""), null);
});

test("hostMismatch: 本体が受けるアプリの下限より古ければアプリの更新、本体の版がアプリの下限より古ければ本体の更新", () => {
  assert.equal(hostMismatch({ api_version: 1, min_client_api_version: 1 }), null);
  assert.equal(hostMismatch({ api_version: 9, min_client_api_version: 9 }), "client_too_old");
  assert.equal(hostMismatch({ api_version: 0, min_client_api_version: 0 }), "host_too_old");
});

test("HostClient: トークンと API の版の見出しを付けて呼び、断られたら状態と印の ApiError", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/api/chats/1/messages")) return new Response(JSON.stringify({ error: "見るだけ", code: "device_read_only" }), { status: 403 });
    if (url.endsWith("/cancel")) return new Response(null, { status: 204 });
    return new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
  }) as unknown as typeof fetch;
  const client = new HostClient({ url: "https://mac.ts.net", token: "t" }, fakeFetch);
  assert.deepEqual(await client.projects(), [{ id: 1 }]);
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer t");
  assert.equal(headers[API_VERSION_HEADER], "1");
  assert.equal(await client.cancel(1), undefined);
  await assert.rejects(client.send(1, "hi"), (e: unknown) => e instanceof ApiError && e.status === 403 && e.code === "device_read_only");
  assert.equal(JSON.parse(String(calls[2].init.body)).text, "hi");
  assert.equal(client.terminalSocketUrl("api:x", 40, 12), "wss://mac.ts.net/api/terminals/api%3Ax/ws?cols=40&rows=12");
  assert.equal(withQuery("/a", { b: 1, c: undefined }), "/a?b=1");
});

test("claimPairing: 番号と名前で頼み、断られたら本体の文で失敗", async () => {
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { code: string };
    if (body.code === "000000") return new Response(JSON.stringify({ error: "番号が違います" }), { status: 400 });
    return new Response(JSON.stringify({ request_id: "r", secret: "s", host_id: "h", url }), { status: 201 });
  }) as unknown as typeof fetch;
  const ok = await claimPairing({ url: "https://m.ts.net", code: "123456", host_id: "h" }, "Pixel", fakeFetch);
  assert.equal(ok.request_id, "r");
  await assert.rejects(claimPairing({ url: "https://m.ts.net", code: "000000", host_id: null }, "Pixel", fakeFetch), /番号が違います/);
});
