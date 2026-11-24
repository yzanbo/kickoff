// 外の画像を取りに行く処理のテスト（行き先にしないアドレスの見分け・手元の HTTP サーバーを相手にした取り方）
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "vitest";
import { afterTest } from "@/foundation/core/testing/afterTest";
import { isBlockedAddress } from "./addresses";
import { fetchRemoteImage, type FetchImageOptions } from "./fetchImage";

test("isBlockedAddress: この Mac の中・手元のネットワーク・リンクローカル・予約は断り、ふつうの外のアドレスは通す", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255"]) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ["::1", "::", "fe80::1", "fd00::1", "fc00::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:192.168.0.1", "::ffff:7f00:1", "[::ffff:7f00:1]", "::ffff:a9fe:a9fe"]) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ["93.184.216.34", "172.32.0.1", "8.8.8.8", "2606:4700::1111", "::ffff:8.8.8.8", "::ffff:808:808"]) {
    assert.equal(isBlockedAddress(ip), false, ip);
  }
  assert.equal(isBlockedAddress("not-an-ip"), true);
});

/** 手元の HTTP サーバー（パスごとの答え）。止めるのはテストのあと */
async function server(routes: Record<string, (res: http.ServerResponse) => void>): Promise<string> {
  const srv = http.createServer((req, res) => {
    const route = routes[req.url ?? ""];
    if (route) return route(res);
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  afterTest(() => new Promise<void>((resolve) => srv.close(() => resolve())));
  return `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
}

/** 手元のサーバー（127.0.0.1）だけは通し、ほかは本物の決まりで断る */
const allowLoopback = (ip: string) => ip !== "127.0.0.1" && isBlockedAddress(ip);
const OPTS: FetchImageOptions = { maxBytes: 100, timeoutMs: 2000, maxRedirects: 2, blocked: allowLoopback };

test("fetchRemoteImage: 画像を取り、転送をたどる（画像でない・大きすぎる・転送が多すぎるは断る）", async () => {
  const base = await server({
    "/a.png": (res) => res.writeHead(200, { "content-type": "image/png; charset=binary" }).end(Buffer.from([1, 2, 3])),
    "/moved": (res) => res.writeHead(302, { location: "/a.png" }).end(),
    "/loop": (res) => res.writeHead(302, { location: "/loop" }).end(),
    "/page": (res) => res.writeHead(200, { "content-type": "text/html" }).end("<p>"),
    "/big.png": (res) => res.writeHead(200, { "content-type": "image/png" }).end(Buffer.alloc(200)),
  });
  assert.deepEqual(await fetchRemoteImage(`${base}/a.png`, OPTS), { contentType: "image/png", body: Buffer.from([1, 2, 3]) });
  assert.deepEqual((await fetchRemoteImage(`${base}/moved`, OPTS)).body, Buffer.from([1, 2, 3]));
  await assert.rejects(fetchRemoteImage(`${base}/page`, OPTS), /画像ではありません/);
  await assert.rejects(fetchRemoteImage(`${base}/big.png`, OPTS), /大きすぎます/);
  await assert.rejects(fetchRemoteImage(`${base}/loop`, OPTS), /転送が多すぎます/);
  await assert.rejects(fetchRemoteImage(`${base}/none.png`, OPTS), /HTTP 404/);
});

test("fetchRemoteImage: 手元のネットワークへは取りに行かない（IP を直に書いた URL も、名前を解いた先も、転送の先も）", async () => {
  const base = await server({ "/a.png": (res) => res.writeHead(200, { "content-type": "image/png" }).end(Buffer.from([1])) });
  const strict = { ...OPTS, blocked: undefined };
  await assert.rejects(fetchRemoteImage(`${base}/a.png`, strict), /手元のネットワーク/);
  await assert.rejects(fetchRemoteImage(base.replace("127.0.0.1", "localhost") + "/a.png", strict), /手元のネットワーク/);
  // 外に見える名前から手元への転送も、転送の先で断る
  const hop = await server({ "/to-local": (res) => res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" }).end() });
  await assert.rejects(fetchRemoteImage(`${hop}/to-local`, OPTS), /手元のネットワーク/);
  // http(s) でないもの・ユーザー名入り
  await assert.rejects(fetchRemoteImage("file:///etc/passwd", strict), /http・https/);
  await assert.rejects(fetchRemoteImage("https://user:pass@example.com/a.png", strict), /ユーザー名/);
});
