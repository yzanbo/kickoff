import assert from "node:assert/strict";
import { test } from "vitest";
import { canDropNotes, crossMoves, foldersAfterTransfer } from "./noteMoveModel";

test("canDropNotes: 同じ欄では自分自身・自分の中・いまあるフォルダへ落とせず、ほかの欄からはどのフォルダへも落とせる", () => {
  const same = { projectId: 1, paths: ["設計", "メモ.md"] };
  assert.equal(canDropNotes(same, 1, "設計"), false);
  assert.equal(canDropNotes(same, 1, "設計/DB"), false);
  assert.equal(canDropNotes({ projectId: 1, paths: ["設計/DB.md"] }, 1, "設計"), false);
  assert.equal(canDropNotes({ projectId: 1, paths: ["設計/DB.md"] }, 1, ""), true);
  assert.equal(canDropNotes(same, 2, "設計"), true);
  assert.equal(canDropNotes(same, 2, ""), true);
  // 何を運んでいるか分からないとき（ほかのウィンドウから）は落とせることにする
  assert.equal(canDropNotes(null, 1, "設計"), true);
});

test("crossMoves: フォルダとその中を両方選んでいればフォルダだけを、行き先のフォルダの下の同じ名前へ", () => {
  assert.deepEqual(crossMoves(["設計", "設計/DB.md", "メモ/案.md"], "受け取り"), [
    { from: "設計", to: "受け取り/設計" },
    { from: "メモ/案.md", to: "受け取り/案.md" },
  ]);
  assert.deepEqual(crossMoves(["メモ/案.md"], ""), [{ from: "メモ/案.md", to: "案.md" }]);
});

test("foldersAfterTransfer: 元の欄からは動かしたものと中を外し、行き先には付け替えたものと親を足す", () => {
  const next = foldersAfterTransfer(["設計", "設計/DB", "日記"], ["受け取り"], "設計", "受け取り/a/設計");
  assert.deepEqual(next.from, ["日記"]);
  assert.deepEqual(next.to, ["受け取り", "受け取り/a/設計", "受け取り/a/設計/DB", "受け取り/a"]);
});
