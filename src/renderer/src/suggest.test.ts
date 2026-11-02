import assert from "node:assert/strict";
import { test } from "node:test";
import { findTrigger, matchCommands, matchFiles } from "./components/suggest/suggestMatch";

test("/ は文の先頭だけ、@ はどこでも（カーソルの前で打っているものを探す）", () => {
  assert.deepEqual(findTrigger("/rev", 4), { kind: "slash", start: 0, query: "rev" });
  assert.equal(findTrigger("見て /rev", 7), null);
  assert.deepEqual(findTrigger("これを @src/ap", 12), { kind: "file", start: 4, query: "src/ap" });
  assert.deepEqual(findTrigger("@", 1), { kind: "file", start: 0, query: "" });
  // メールアドレスのような途中の @ では出さない
  assert.equal(findTrigger("a@b", 3), null);
  // カーソルより後ろは見ない
  assert.equal(findTrigger("/review 続き", 10), null);
});

test("コマンドは名前の始まり → 名前に含む → 説明に含むの順", () => {
  const c = (name: string, description = "") => ({ name, description, argumentHint: "" });
  const list = [c("pr-comments", "PR のコメント"), c("review", "コードを見直す"), c("compact"), c("init", "review の準備")];
  assert.deepEqual(matchCommands(list, "re").map((x) => x.name), ["review", "init"]);
  assert.deepEqual(matchCommands(list, "").map((x) => x.name), ["compact", "init", "pr-comments", "review"]);
});

test("ファイルはファイル名の始まり → ファイル名に含む → パスに含むの順（同じなら短いパス）", () => {
  const files = ["src/api.ts", "src/core/api/server.ts", "docs/api.md", "src/renderer/src/rapid.ts"];
  assert.deepEqual(matchFiles(files, "api"), ["src/api.ts", "docs/api.md", "src/renderer/src/rapid.ts", "src/core/api/server.ts"]);
});
