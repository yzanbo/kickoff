import assert from "node:assert/strict";
import { test } from "vitest";
import { relativize } from "./relativePath";

test("relativize: リポジトリの絶対パスを相対パスにする（リポジトリそのものは「.」）", () => {
  const repo = "/Users/me/app";
  assert.equal(relativize("/Users/me/app/src/a.ts を読む", repo), "src/a.ts を読む");
  assert.equal(relativize("cd /Users/me/app && npm test", repo), "cd . && npm test");
  assert.equal(relativize("ほかの /tmp/x", repo), "ほかの /tmp/x");
  assert.equal(relativize("`/Users/me/app` で実行", repo), "`.` で実行");
  // 名前に文字が続く別のパス（隣のワークツリーなど）は変えない
  assert.equal(relativize("/Users/me/app-worktrees/x/src/a.ts", repo), "/Users/me/app-worktrees/x/src/a.ts");
  assert.equal(relativize("/Users/me/app.bak/a と /Users/me/app2/b", repo), "/Users/me/app.bak/a と /Users/me/app2/b");
  // 正規表現で意味のある文字を含むパス
  assert.equal(relativize("/x/app (1)/src/a.ts", "/x/app (1)"), "src/a.ts");
});
