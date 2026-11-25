import assert from "node:assert/strict";
import { test } from "vitest";
import { fileLinkPlaceOf } from "./linkPlace";

test("fileLinkPlaceOf: 右の欄を置ければ、共通のチャットでも右の欄", () => {
  assert.equal(fileLinkPlaceOf({ side: true, common: false }), "side");
  assert.equal(fileLinkPlaceOf({ side: true, common: true }), "side");
});

test("fileLinkPlaceOf: 右の欄を置けなければ、共通のチャットは別ウィンドウ・プロジェクトのチャットはファイルのタブ", () => {
  assert.equal(fileLinkPlaceOf({ side: false, common: true }), "window");
  assert.equal(fileLinkPlaceOf({ side: false, common: false }), "tab");
});
