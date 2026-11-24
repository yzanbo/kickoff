import assert from "node:assert/strict";
import { test } from "vitest";
import { IMMUTABLE_CACHE, isHashedAsset, rendererCacheControl, unhashedAssets } from "./rendererCache";

test("/assets/ の下は 1 年・変わらない、ほか（index.html・favicon・SPA のパス）は毎回確かめる", () => {
  assert.equal(isHashedAsset("/assets/index-DRTQGs3N.js"), true);
  for (const path of ["/favicon.svg", "/boot.js", "/", "/projects/1", "/index.html"]) {
    assert.equal(isHashedAsset(path), false, path);
    assert.equal(rendererCacheControl(path), "no-cache", path);
  }
  assert.equal(rendererCacheControl("/assets/index-DRTQGs3N.js"), IMMUTABLE_CACHE);
});

test("ビルドの確かめ: assets/ のファイルの名前のうち、中身のハッシュの形でないものを返す", () => {
  assert.deepEqual(unhashedAssets(["index-DRTQGs3N.js", "KaTeX_Main-Regular-B22Nviop.woff2", "mermaid.core-a_b-C9x1.js", "logo.png", "index.js", "app-abc.css"]), ["logo.png", "index.js", "app-abc.css"]);
});
