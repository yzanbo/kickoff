import assert from "node:assert/strict";
import { test } from "node:test";
import { baseName, formatTokens, splitPath } from "./format";

test("baseName: パスの最後の名前（split(\"/\").pop() と同じ結果）", () => {
  for (const path of ["/Users/me/app/src/index.ts", "src/index.ts", "index.ts", "", "/a/b/", "/Users/me/kickoff-worktrees/feature"]) {
    assert.equal(baseName(path), path.split("/").pop());
  }
  assert.equal(baseName("/Users/me/app"), "app");
  assert.equal(baseName("app"), "app");
  assert.equal(baseName("/a/b/"), "");
});

test("splitPath: 最後の名前と親フォルダに分ける", () => {
  assert.deepEqual(splitPath("src/renderer/App.tsx"), { name: "App.tsx", dir: "src/renderer" });
  assert.deepEqual(splitPath("README.md"), { name: "README.md", dir: "" });
  assert.deepEqual(splitPath("/Users/me/docs/spec"), { name: "spec", dir: "/Users/me/docs" });
  assert.deepEqual(splitPath("/notes"), { name: "notes", dir: "/" });
  // 末尾の / は除いて分ける（フォルダのパス）
  assert.deepEqual(splitPath("/Users/me/design/"), { name: "design", dir: "/Users/me" });
  assert.deepEqual(splitPath("/"), { name: "", dir: "/" });
});

test("formatTokens: 1000 未満はそのまま、k・m に丸める", () => {
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(246_000), "246k");
  assert.equal(formatTokens(1_000_000), "1m");
  assert.equal(formatTokens(1_250_000), "1.3m");
});
