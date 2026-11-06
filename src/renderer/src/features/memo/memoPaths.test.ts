import assert from "node:assert/strict";
import { test } from "node:test";
import type { MemoEntry } from "@shared/types";
import { ancestorsOf, buildMemoTree, filterMemos, isUnder, memoTitle, pathTaken, recentMemos, remapPath, renamedPath } from "./memoPaths";

const entry = (path: string, dir = false, modified_at = "2026-11-05T00:00:00.000Z"): MemoEntry => ({ path, dir, modified_at });

test("buildMemoTree: フォルダを先に名前の順。中身のないフォルダも出す", () => {
  const tree = buildMemoTree([entry("b.md"), entry("設計", true), entry("設計/DB.md"), entry("空", true), entry("A.md"), entry("メモ10.md"), entry("メモ2.md")]);
  assert.deepEqual(
    tree.map((n) => [n.name, n.dir]),
    [["空", true], ["設計", true], ["A.md", false], ["b.md", false], ["メモ2.md", false], ["メモ10.md", false]],
  );
  assert.deepEqual(tree[1].children.map((n) => n.path), ["設計/DB.md"]);
});

test("名前の変更・移動のパス", () => {
  assert.equal(memoTitle("設計/DB の方針.md"), "DB の方針");
  assert.equal(memoTitle("画像.png"), "画像.png");
  assert.equal(renamedPath("設計/DB.md", false, "データベース"), "設計/データベース.md");
  assert.equal(renamedPath("設計", true, "設計メモ"), "設計メモ");
  assert.equal(renamedPath("図.png", false, "図2.png"), "図2.png");
  assert.equal(memoTitle("資料/計画.html"), "計画");
  assert.equal(renamedPath("資料/計画.HTML", false, "企画"), "資料/企画.html");
  assert.equal(remapPath("設計/DB.md", "設計", "設計メモ"), "設計メモ/DB.md");
  assert.equal(remapPath("設計2/DB.md", "設計", "設計メモ"), "設計2/DB.md");
  assert.equal(remapPath("a.md", "a.md", "b/a.md"), "b/a.md");
  assert.ok(isUnder("a/b.md", "a") && isUnder("a", "a") && isUnder("x.md", "") && !isUnder("ab/c.md", "a"));
  assert.deepEqual(ancestorsOf("a/b/c.md"), ["a", "a/b"]);
});

test("recentMemos: メモのファイルだけを、新しく変えた順に limit 件（種類を渡せばその種類だけ）", () => {
  const entries = [entry("設計", true), entry("a.md", false, "2026-11-01T00:00:00Z"), entry("b.md", false, "2026-11-03T00:00:00Z"), entry("c.txt", false, "2026-11-04T00:00:00Z"), entry("d.md", false, "2026-10-01T00:00:00Z"), entry("e.html", false, "2026-11-02T00:00:00Z")];
  assert.deepEqual(recentMemos(entries, 2).map((e) => e.path), ["b.md", "e.html"]);
  assert.deepEqual(recentMemos(entries, 2, "markdown").map((e) => e.path), ["b.md", "a.md"]);
});

test("filterMemos: ファイルだけを名前で絞り、新しく変えた順", () => {
  const list = filterMemos([entry("設計", true), entry("設計/DB.md", false, "2026-11-01T00:00:00Z"), entry("db2.md", false, "2026-11-03T00:00:00Z"), entry("ほか.md")], "DB");
  assert.deepEqual(list.map((e) => e.path), ["db2.md", "設計/DB.md"]);
});

test("pathTaken: 同じフォルダの同じ名前（拡張子まで。大文字・小文字は区別しない）だけを重なりとみなす", () => {
  const entries = [entry("設計", true), entry("設計/DB.md"), entry("計画.md")];
  assert.ok(pathTaken(entries, "設計/db.md"));
  assert.ok(pathTaken(entries, "設計"));
  assert.ok(!pathTaken(entries, "設計/DB.html"));
  assert.ok(!pathTaken(entries, "DB.md"));
  assert.ok(!pathTaken(entries, "計画"));
  // 名前を変える元は数えない（大文字・小文字だけの変更）
  assert.ok(!pathTaken(entries, "設計/db.md", "設計/DB.md"));
});
