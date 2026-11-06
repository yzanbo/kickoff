import assert from "node:assert/strict";
import { test } from "node:test";
import { toolImageType } from "./toolImage";

test("toolImageType: 画像の拡張子だけを Content-Type にする（大文字も）", () => {
  assert.equal(toolImageType("/a/b/画面.png"), "image/png");
  assert.equal(toolImageType("/a/b/photo.JPG"), "image/jpeg");
  assert.equal(toolImageType("x.webp"), "image/webp");
  assert.equal(toolImageType("/a/b/c.svg"), null);
  assert.equal(toolImageType("/a/b/README.md"), null);
  // 拡張子のない名前・「.」で始まる名前・フォルダの「.」は見ない
  assert.equal(toolImageType("/a/b/png"), null);
  assert.equal(toolImageType("/a/b/.png"), null);
  assert.equal(toolImageType("/a/b.png/file"), null);
});
