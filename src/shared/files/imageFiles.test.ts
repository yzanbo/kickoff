import assert from "node:assert/strict";
import { test } from "node:test";
import { imageFileType, isIcnsFile, isSvgFile } from "./imageFiles";

test("画像として見せるファイル: 拡張子で決め、大文字・小文字は問わない（icns は PNG にして返す）", () => {
  assert.equal(imageFileType("build/icon.png"), "image/png");
  assert.equal(imageFileType("a/B.JPG"), "image/jpeg");
  assert.equal(imageFileType("icon.svg"), "image/svg+xml");
  assert.equal(imageFileType("build/icon-dev.icns"), "image/png");
  assert.equal(imageFileType("src/app.ts"), null);
  assert.equal(imageFileType(".png"), null);
  assert.equal(imageFileType("png"), null);
  assert.ok(isSvgFile("x/Logo.SVG"));
  assert.ok(!isSvgFile("x/logo.png"));
  assert.ok(isIcnsFile("icon.icns"));
});
