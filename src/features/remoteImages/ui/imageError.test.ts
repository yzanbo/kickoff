import assert from "node:assert/strict";
import { test } from "vitest";
import { imageErrorText } from "./imageError";

test("imageErrorText: コアが前置きを付けた文はそのまま、ほかの理由は前置きを付ける", () => {
  assert.equal(imageErrorText("画像を読み込めませんでした（HTTP 404）"), "画像を読み込めませんでした（HTTP 404）");
  assert.equal(imageErrorText("ファイルが見つかりません"), "画像を読み込めませんでした（ファイルが見つかりません）");
});
