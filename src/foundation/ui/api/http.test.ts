import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { CORE_DOWN_SEND_MESSAGE } from "@shared/foundation/ipc";
import { ApiError, request, withQuery } from "./http";
import { workdirPath } from "./workdir";

test("withQuery: 値のない項目（undefined・null・空の文字）は付けず、真偽値は 1 / 0、数は文字にする", () => {
  assert.equal(withQuery("/api/chats", {}), "/api/chats");
  assert.equal(withQuery("/api/chats", { limit: 300, archived: true }), "/api/chats?limit=300&archived=1");
  assert.equal(withQuery("/api/chats", { archived: false, q: "", project_id: undefined, chat_id: null }), "/api/chats?archived=0");
  // 文字は URL の形に直す（空白・日本語・& など）
  assert.equal(withQuery("/api/search", { q: "a b&c 日本" }), "/api/search?q=a+b%26c+%E6%97%A5%E6%9C%AC");
});

test("workdirPath: プロジェクトの番号だけなら本体、worktree があればそのワークツリー（?worktree=）", () => {
  assert.equal(workdirPath(3, "/git/status"), "/api/projects/3/git/status");
  assert.equal(workdirPath({ projectId: 3 }, "/git/log", { skip: 0 }), "/api/projects/3/git/log?skip=0");
  assert.equal(workdirPath({ projectId: 3, worktree: "/w/a" }, "/file", { path: "src/a.ts" }), "/api/projects/3/file?path=src%2Fa.ts&worktree=%2Fw%2Fa");
});

/** request の失敗を受け取る */
async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    assert.ok(e instanceof ApiError);
    return e;
  }
  assert.fail("失敗しませんでした");
}

test("request: つながらない（コアのプロセスを作り直している間）は core_down で、Mac のアプリでは帯と同じ言葉にする（入力欄はこの文を出して文を残す）", async () => {
  vi.stubGlobal("window", { kickoff: {} });
  vi.stubGlobal("fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
  const e = await failureOf(request("POST", "/api/chats/1/turns", { text: "a" }));
  assert.equal(e.code, "core_down");
  assert.equal(e.status, 0);
  assert.equal(e.message, CORE_DOWN_SEND_MESSAGE);
});

test("request: JSON でない 5xx（開発時の転送がコアにつなげなかった）も core_down、コアが返した失敗はその文のまま", async () => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("fetch", async () => new Response("", { status: 502 }));
  const down = await failureOf(request("GET", "/api/status"));
  assert.equal(down.code, "core_down");
  assert.equal(down.status, 502);
  assert.match(down.message, /Kickoff につながりません/);
  vi.stubGlobal("fetch", async () => Response.json({ error: "壊れました" }, { status: 500 }));
  const server = await failureOf(request("GET", "/api/status"));
  assert.equal(server.code, undefined);
  assert.equal(server.message, "壊れました");
  vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
  assert.equal((await failureOf(request("GET", "/api/x"))).message, "HTTP 404");
});
