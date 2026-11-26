import assert from "node:assert/strict";
import { test } from "vitest";
import { fileLinkPlaceOf, fileMenuPlaces } from "./linkPlace";

test("fileLinkPlaceOf: 右の欄を置ければ、ファイルのタブがなくても（共通のチャット）右の欄", () => {
  assert.equal(fileLinkPlaceOf({ side: true, fileTab: true }), "side");
  assert.equal(fileLinkPlaceOf({ side: true, fileTab: false }), "side");
});

test("fileLinkPlaceOf: 右の欄を置けなければ、ファイルのタブのない共通のチャットは別ウィンドウ・プロジェクトのチャットはファイルのタブ", () => {
  assert.equal(fileLinkPlaceOf({ side: false, fileTab: false }), "window");
  assert.equal(fileLinkPlaceOf({ side: false, fileTab: true }), "tab");
});

test("fileMenuPlaces: ファイルのタブがなければ押したときの開き方だけ（右の欄を置けなければ別ウィンドウ）、あればファイルタブも出す", () => {
  assert.deepEqual(fileMenuPlaces({ side: true, fileTab: false }), ["side"]);
  assert.deepEqual(fileMenuPlaces({ side: false, fileTab: false }), ["window"]);
  assert.deepEqual(fileMenuPlaces({ side: true, fileTab: true }), ["side", "tab"]);
  assert.deepEqual(fileMenuPlaces({ side: false, fileTab: true }), ["tab"]);
});
