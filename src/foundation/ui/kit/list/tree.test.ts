import assert from "node:assert/strict";
import { test } from "vitest";
import { flattenTree, guideLevels, subtreeEnds, treeKeyMove, type TreeNode } from "./tree";

const roots: TreeNode<string>[] = [
  { key: "a", children: [{ key: "a/x" }, { key: "a/y", children: "lazy" }] },
  { key: "b", children: [] },
  { key: "c" },
];
const openOf = (...keys: string[]) => ({ isOpen: (k: string) => keys.includes(k) });

test("flattenTree: 開いたフォルダの中だけを段と親つきで並べ、children のある行は開閉できる", () => {
  assert.deepEqual(
    flattenTree(roots, openOf()).map((r) => [r.key, r.depth, r.parent, r.hasChildren, r.open]),
    [
      ["a", 0, null, true, false],
      ["b", 0, null, true, false],
      ["c", 0, null, false, false],
    ],
  );
  // "lazy" の子は開いても行がない（読み込んだら children を渡し直す）
  assert.deepEqual(
    flattenTree(roots, openOf("a", "a/y")).map((r) => [r.key, r.depth, r.parent, r.open]),
    [
      ["a", 0, null, true],
      ["a/x", 1, "a", false],
      ["a/y", 1, "a", true],
      ["b", 0, null, false],
      ["c", 0, null, false],
    ],
  );
});

test("treeKeyMove: ↑↓ は端で回り込み、Home / End は先頭・最後", () => {
  const rows = flattenTree(roots, openOf("a"));
  assert.deepEqual(treeKeyMove(rows, "c", "ArrowDown"), { type: "focus", key: "a" });
  assert.deepEqual(treeKeyMove(rows, "a", "ArrowUp"), { type: "focus", key: "c" });
  assert.deepEqual(treeKeyMove(rows, null, "ArrowDown"), { type: "focus", key: "a" });
  assert.deepEqual(treeKeyMove(rows, "a/x", "End"), { type: "focus", key: "c" });
  assert.deepEqual(treeKeyMove(rows, "c", "Home"), { type: "focus", key: "a" });
});

test("treeKeyMove: → で開く・開いていれば最初の子へ、← で閉じる・閉じていれば親へ", () => {
  assert.deepEqual(treeKeyMove(flattenTree(roots, openOf()), "a", "ArrowRight"), { type: "open", key: "a" });
  const rows = flattenTree(roots, openOf("a", "b"));
  assert.deepEqual(treeKeyMove(rows, "a", "ArrowRight"), { type: "focus", key: "a/x" });
  // 中が空のフォルダ・子のない行は → で動かない
  assert.equal(treeKeyMove(rows, "b", "ArrowRight"), null);
  assert.equal(treeKeyMove(rows, "c", "ArrowRight"), null);
  assert.deepEqual(treeKeyMove(rows, "a", "ArrowLeft"), { type: "close", key: "a" });
  assert.deepEqual(treeKeyMove(rows, "a/x", "ArrowLeft"), { type: "focus", key: "a" });
  assert.equal(treeKeyMove(rows, "c", "ArrowLeft"), null);
});

test("treeKeyMove: Space で開く・Enter で名前の変更（行を選んでいなければ動かない）", () => {
  const rows = flattenTree(roots, openOf());
  assert.deepEqual(treeKeyMove(rows, "c", " "), { type: "activate", key: "c" });
  assert.deepEqual(treeKeyMove(rows, "c", "Enter"), { type: "rename", key: "c" });
  assert.equal(treeKeyMove(rows, null, "Enter"), null);
  assert.equal(treeKeyMove(rows, "c", "x"), null);
});

const deep: TreeNode<string>[] = [{ key: "a", children: [{ key: "a/b", children: [{ key: "a/b/c" }] }, { key: "a/d" }] }, { key: "e" }];

test("guideLevels: 選んだ行の親の段（中身の見える開いたフォルダなら中身の段）を、その段の中の行に付ける", () => {
  const rows = flattenTree(deep, openOf("a", "a/b"));
  // a, a/b, a/b/c, a/d, e
  assert.deepEqual(guideLevels(rows, (k) => k === "a/b/c"), [null, null, 1, null, null]);
  assert.deepEqual(guideLevels(rows, (k) => k === "a/d"), [null, 0, 0, 0, null]);
  // 開いたフォルダを選べば、その中身の段
  assert.deepEqual(guideLevels(rows, (k) => k === "a/b"), [null, null, 1, null, null]);
  // いちばん上の段の行・閉じたフォルダは親の段がない
  assert.deepEqual(guideLevels(flattenTree(deep, openOf()), (k) => k === "a"), [null, null]);
});

test("subtreeEnds: 中身の見える開いたフォルダの行だけ、中身の最後の行の位置", () => {
  assert.deepEqual(subtreeEnds(flattenTree(deep, openOf("a", "a/b"))), [3, 2, null, null, null]);
  assert.deepEqual(subtreeEnds(flattenTree(roots, openOf("a", "b"))), [2, null, null, null, null]);
});
