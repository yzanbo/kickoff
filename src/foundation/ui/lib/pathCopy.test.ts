import assert from "node:assert/strict";
import { test } from "vitest";
import { lineLocation, textWithPath } from "./pathCopy";

test("lineLocation: フルパスに行番号を付ける（1 行なら 1 つ、行が分からなければパスだけ）", () => {
  assert.equal(lineLocation("/ノート/DB.md", { from: 3, to: 5 }), "/ノート/DB.md:3-5");
  assert.equal(lineLocation("/ノート/DB.md", { from: 7, to: 7 }), "/ノート/DB.md:7");
  assert.equal(lineLocation("/ノート/DB.md", null), "/ノート/DB.md");
});

test("textWithPath: 場所の行の下に空行を挟んで選択部分をそのまま（末尾の改行は詰める）", () => {
  assert.equal(textWithPath("/a/b.ts:2-3", "const a = 1;\n  const b = 2;\n\n"), "/a/b.ts:2-3\n\nconst a = 1;\n  const b = 2;");
});
