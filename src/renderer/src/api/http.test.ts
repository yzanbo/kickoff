import assert from "node:assert/strict";
import { test } from "node:test";
import { withQuery } from "./http";
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
