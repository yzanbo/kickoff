import assert from "node:assert/strict";
import { test } from "vitest";
import { noteAssetBase, noteLinkPath, pageMayRead } from "./htmlPage";

test("noteAssetBase: ノートのフォルダを段ごとに URL の形にする（直下ならフォルダなし）", () => {
  assert.equal(noteAssetBase("http://x", 3, ""), "http://x/api/projects/3/note/file/");
  assert.equal(noteAssetBase("http://x", 3, "資料/a #1"), "http://x/api/projects/3/note/file/%E8%B3%87%E6%96%99/a%20%231/");
});

test("noteLinkPath: ノートのフォルダの中のパスに戻す（? と # を除く。外・フォルダ・壊れた形は null）", () => {
  const root = "http://x/api/projects/3/note/file/";
  assert.equal(noteLinkPath(`${root}%E8%B3%87%E6%96%99/a%20%231.html?v=1#top`, root), "資料/a #1.html");
  assert.equal(noteLinkPath(`${root}b.md`, root), "b.md");
  assert.equal(noteLinkPath(`${root}資料/`, root), "資料");
  assert.equal(noteLinkPath(root, root), null);
  assert.equal(noteLinkPath("http://x/api/projects/4/note/file/b.md", root), null);
  assert.equal(noteLinkPath(`${root}a%2Fb.md`, root), null);
  assert.equal(noteLinkPath(`${root}%E0%A4%A.md`, root), null);
});

test("pageMayRead: ページが読むかもしれないファイル（CSS・画像・ページ・分からない）だけ読み直し、ほかの Markdown のノートでは読み直さない", () => {
  for (const path of ["style.css", "資料/図.PNG", "b.html", "a.js", "font.woff2", null]) assert.equal(pageMayRead(path), true, String(path));
  for (const path of ["メモ.md", "資料/計画.markdown", "note.txt"]) assert.equal(pageMayRead(path), false, path);
});
