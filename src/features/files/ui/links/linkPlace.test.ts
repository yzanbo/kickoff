import assert from "node:assert/strict";
import { test } from "vitest";
import { fileLinkPlaceOf, fileMenuPlaces } from "./linkPlace";

test("fileLinkPlaceOf: 右の欄を置ければ、共通のチャットでも右の欄", () => {
  assert.equal(fileLinkPlaceOf({ side: true, common: false }), "side");
  assert.equal(fileLinkPlaceOf({ side: true, common: true }), "side");
});

test("fileLinkPlaceOf: 右の欄を置けなければ、共通のチャットは別ウィンドウ・プロジェクトのチャットはファイルのタブ", () => {
  assert.equal(fileLinkPlaceOf({ side: false, common: true }), "window");
  assert.equal(fileLinkPlaceOf({ side: false, common: false }), "tab");
});

test("fileMenuPlaces: 共通のチャットは押したときの開き方だけ（右の欄を置けなければ別ウィンドウ）、プロジェクトのチャットはファイルタブも出す", () => {
  assert.deepEqual(fileMenuPlaces({ side: true, common: true }), ["side"]);
  assert.deepEqual(fileMenuPlaces({ side: false, common: true }), ["window"]);
  assert.deepEqual(fileMenuPlaces({ side: true, common: false }), ["side", "tab"]);
  assert.deepEqual(fileMenuPlaces({ side: false, common: false }), ["tab"]);
});
