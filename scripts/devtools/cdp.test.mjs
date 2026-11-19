import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { apiPort, cdpPort, findAppPage } from "./cdp.mjs";

const target = (type, url) => ({ type, url, webSocketDebuggerUrl: `ws://127.0.0.1:9333/devtools/page/${url.length}` });

test("アプリの画面を選び、別ウィンドウ・devtools・webview・ほかのページを除く", () => {
  const app = target("page", "http://localhost:5173/#/projects/1");
  const targets = [
    target("page", "devtools://devtools/bundled/inspector.html"),
    target("page", "http://localhost:5173/#/popout/chat?id=3"),
    target("webview", "http://localhost:5173/#/"),
    target("page", "https://example.com/"),
    target("service_worker", "http://localhost:5173/sw.js"),
    app,
  ];
  assert.equal(findAppPage(targets), app);
  // コアが配る画面（127.0.0.1）・ハッシュのない URL も画面
  const served = target("page", "http://127.0.0.1:4396/");
  assert.equal(findAppPage([served]), served);
  assert.equal(findAppPage([target("page", "http://localhost:5173/index.html#/")])?.url, "http://localhost:5173/index.html#/");
  // 別のパスのページ（埋め込みブラウザが開いたローカルのページなど）は選ばない
  assert.equal(findAppPage([target("page", "http://localhost:3000/docs")]), null);
  assert.equal(findAppPage([target("page", "http://localhost:5173/#/popout/side")]), null);
  assert.equal(findAppPage([]), null);
});

test("CDP のポートは 引数 --cdp > KICKOFF_REMOTE_DEBUG > 9333", () => {
  vi.stubEnv("KICKOFF_REMOTE_DEBUG", undefined);
  assert.equal(cdpPort(["node", "x.mjs"]), 9333);
  vi.stubEnv("KICKOFF_REMOTE_DEBUG", "9444");
  assert.equal(cdpPort(["node", "x.mjs"]), 9444);
  assert.equal(cdpPort(["node", "x.mjs", "take", "a", "--cdp", "9335"]), 9335);
  assert.equal(cdpPort(["node", "x.mjs", "--cdp=9336"]), 9336);
});

test("コアのポートは 引数 --api > KICKOFF_PORT > 4318", () => {
  vi.stubEnv("KICKOFF_PORT", undefined);
  assert.equal(apiPort(["node", "x.mjs"]), 4318);
  vi.stubEnv("KICKOFF_PORT", "4396");
  assert.equal(apiPort(["node", "x.mjs"]), 4396);
  assert.equal(apiPort(["node", "x.mjs", "--api", "4319"]), 4319);
});
