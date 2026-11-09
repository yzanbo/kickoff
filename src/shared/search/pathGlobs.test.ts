import assert from "node:assert/strict";
import { test } from "node:test";
import { expandBraces, splitGlobList, toPathspecs } from "./pathGlobs";

test("splitGlobList: カンマで分ける（{} の中は分けない）", () => {
  assert.deepEqual(splitGlobList(" *.ts, src/{a,b}/** ,, "), ["*.ts", "src/{a,b}/**"]);
});

test("expandBraces: {} を広げる（入れ子も）", () => {
  assert.deepEqual(expandBraces("*.{ts,tsx}"), ["*.ts", "*.tsx"]);
  assert.deepEqual(expandBraces("{a,b{1,2}}/x"), ["a/x", "b1/x", "b2/x"]);
  assert.deepEqual(expandBraces("plain"), ["plain"]);
});

test("toPathspecs: VS Code と同じ読み方で git の pathspec にする", () => {
  assert.deepEqual(toPathspecs("", ""), []);
  // 記号のない名前は、どの深さでもそのファイルとフォルダの中
  assert.deepEqual(toPathspecs("src", ""), [":(glob)**/src", ":(glob)**/src/**"]);
  // ./ は作業場所から、/ で終わればフォルダの中
  assert.deepEqual(toPathspecs("./src/editor/", ""), [":(glob)src/editor/**"]);
  assert.deepEqual(toPathspecs("*.{ts,tsx}", "**/*.test.ts"), [":(glob)**/*.ts", ":(glob)**/*.tsx", ":(glob,exclude)**/*.test.ts"]);
});
