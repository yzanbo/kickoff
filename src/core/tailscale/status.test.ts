import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTailscaleStatus, serveCommand, serveUrlsFor } from "./status.js";

test("parseTailscaleStatus: つながっていればこの Mac の名前（末尾の . は落とす）。止まっている・ログインしていなければ名前は出さない", () => {
  assert.deepEqual(parseTailscaleStatus({ BackendState: "Running", Self: { DNSName: "mac.tailnet.ts.net." } }), { running: true, dns_name: "mac.tailnet.ts.net" });
  assert.deepEqual(parseTailscaleStatus({ BackendState: "Stopped", Self: { DNSName: "mac.tailnet.ts.net." } }), { running: false, dns_name: null });
  assert.deepEqual(parseTailscaleStatus({ BackendState: "NeedsLogin" }), { running: false, dns_name: null });
  assert.deepEqual(parseTailscaleStatus(null), { running: false, dns_name: null });
});

test("serveUrlsFor: このポートへ渡している / の Serve の URL。ほかのポート・ほかのパスは別に並べる", () => {
  const config = {
    TCP: { "443": { HTTPS: true }, "8443": { HTTPS: true } },
    Web: {
      "mac.tailnet.ts.net:443": { Handlers: { "/": { Proxy: "http://127.0.0.1:5317" } } },
      "mac.tailnet.ts.net:8443": { Handlers: { "/": { Proxy: "http://localhost:5318" }, "/docs": { Path: "/tmp/docs" } } },
    },
  };
  assert.deepEqual(serveUrlsFor(config, 5318), { serve_url: "https://mac.tailnet.ts.net:8443", other_serves: ["https://mac.tailnet.ts.net → http://127.0.0.1:5317"] });
  assert.deepEqual(serveUrlsFor(config, 5317), { serve_url: "https://mac.tailnet.ts.net", other_serves: ["https://mac.tailnet.ts.net:8443 → http://localhost:5318"] });
  assert.deepEqual(serveUrlsFor({}, 5317), { serve_url: null, other_serves: [] });
  assert.deepEqual(serveUrlsFor(null, 5317), { serve_url: null, other_serves: [] });
  // 行き先が番号だけでも、この Mac の中のそのポート
  assert.equal(serveUrlsFor({ Web: { "m.ts.net:443": { Handlers: { "/": { Proxy: "5317" } } } } }, 5317).serve_url, "https://m.ts.net");
  // ほかのホストへの転送は、同じポートでも本体ではない
  assert.equal(serveUrlsFor({ Web: { "m.ts.net:443": { Handlers: { "/": { Proxy: "http://192.168.1.2:5317" } } } } }, 5317).serve_url, null);
});

test("serveCommand: 本体のポートへ HTTPS で渡す。空白のある場所のコマンドは囲む", () => {
  assert.equal(serveCommand("tailscale", 5318), "tailscale serve --bg --https=443 http://127.0.0.1:5318");
  assert.equal(serveCommand("/Applications/My Tools/tailscale", 5317), '"/Applications/My Tools/tailscale" serve --bg --https=443 http://127.0.0.1:5317');
});
