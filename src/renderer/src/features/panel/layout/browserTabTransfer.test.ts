import assert from "node:assert/strict";
import { test } from "vitest";
import { parseMovingBrowserTab } from "./browserTabTransfer";

test("ウィンドウをまたいで渡すブラウザのタブ: 欄・キー・ページ・名前がそろっていれば読み、形が合わなければ null", () => {
  const moving = { panel: "side:21", key: "browser:1:abc", url: "https://example.com/", title: "Example" };
  assert.deepEqual(parseMovingBrowserTab(JSON.stringify(moving)), moving);
  assert.equal(parseMovingBrowserTab(JSON.stringify({ ...moving, url: 1 })), null);
  assert.equal(parseMovingBrowserTab("null"), null);
  assert.equal(parseMovingBrowserTab("{"), null);
});
