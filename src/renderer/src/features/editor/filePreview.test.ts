import assert from "node:assert/strict";
import { test } from "node:test";
import { pagePreviewKind, projectAssetBase } from "./filePreview";

test("pagePreviewKind: Markdown と HTML の拡張子だけ（大文字も）。ほかは null", () => {
  assert.equal(pagePreviewKind("README.md"), "markdown");
  assert.equal(pagePreviewKind("docs/a.Markdown"), "markdown");
  assert.equal(pagePreviewKind("site/index.HTML"), "html");
  assert.equal(pagePreviewKind("a.htm"), "html");
  assert.equal(pagePreviewKind("a.svg"), null);
  assert.equal(pagePreviewKind("md"), null);
  assert.equal(pagePreviewKind("dir.md/file.ts"), null);
});

test("projectAssetBase: ファイルの入ったフォルダの口（本体は -、ワークツリーは 1 段に符号化。段ごとに符号化）", () => {
  assert.equal(projectAssetBase("http://h", 3, undefined, "index.html"), "http://h/api/projects/3/file/asset/-/");
  assert.equal(projectAssetBase("http://h", 3, undefined, "site/お知らせ/a.html"), "http://h/api/projects/3/file/asset/-/site/%E3%81%8A%E7%9F%A5%E3%82%89%E3%81%9B/");
  assert.equal(projectAssetBase("http://h", 3, "/tmp/wt a", "docs/x.html"), "http://h/api/projects/3/file/asset/%2Ftmp%2Fwt%20a/docs/");
});
