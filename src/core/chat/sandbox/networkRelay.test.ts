import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { connectTarget, startNetworkRelay } from "./networkRelay.js";

/** 相手になる HTTP のサーバー（中身は「ok <パス>」） */
async function target(): Promise<number> {
  const server = http.createServer((req, res) => res.end(`ok ${req.url}`));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return (server.address() as AddressInfo).port;
}

test("CONNECT の宛先を読む（IPv6 も。読めないものは null）", () => {
  assert.deepEqual(connectTarget("example.com:443"), { host: "example.com", port: 443 });
  assert.deepEqual(connectTarget("[::1]:8080"), { host: "::1", port: 8080 });
  assert.equal(connectTarget("example.com"), null);
  assert.equal(connectTarget("example.com:0"), null);
  assert.equal(connectTarget("example.com:70000"), null);
});

test("中継は CONNECT のトンネルとふつうの HTTP の両方をどこへでも通す", async () => {
  const port = await target();
  const relay = await startNetworkRelay();
  after(() => relay.close());

  // ふつうの HTTP（絶対 URL の頼み）
  const plain = await new Promise<string>((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: relay.port, path: `http://127.0.0.1:${port}/hello` }, (res) => {
        let body = "";
        res.on("data", (c: Buffer) => (body += c.toString()));
        res.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
  assert.equal(plain, "ok /hello");

  // CONNECT でトンネルを開き、その中で HTTP を話す
  const tunneled = await new Promise<string>((resolve, reject) => {
    const socket = net.connect(relay.port, "127.0.0.1", () => socket.write(`CONNECT 127.0.0.1:${port} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`));
    let buf = "";
    let opened = false;
    socket.on("data", (c: Buffer) => {
      buf += c.toString();
      if (!opened && buf.includes("\r\n\r\n")) {
        assert.match(buf, /^HTTP\/1\.1 200/);
        opened = true;
        buf = "";
        socket.write(`GET /tunnel HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
      }
    });
    socket.on("end", () => resolve(buf));
    socket.on("error", reject);
  });
  assert.match(tunneled, /ok \/tunnel$/);
});

test("つなげない宛先は 502 を返す", async () => {
  const relay = await startNetworkRelay();
  after(() => relay.close());
  // 使っていないポート（一度開いて閉じたもの）
  const free = await new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const p = (s.address() as AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
  const reply = await new Promise<string>((resolve, reject) => {
    const socket = net.connect(relay.port, "127.0.0.1", () => socket.write(`CONNECT 127.0.0.1:${free} HTTP/1.1\r\n\r\n`));
    let buf = "";
    socket.on("data", (c: Buffer) => (buf += c.toString()));
    socket.on("end", () => resolve(buf));
    socket.on("error", reject);
  });
  assert.match(reply, /^HTTP\/1\.1 502/);
});
