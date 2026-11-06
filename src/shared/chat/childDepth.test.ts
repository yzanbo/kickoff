import assert from "node:assert/strict";
import { test } from "node:test";
import { childDepthLabel, childDepthShort } from "./childDepth";

test("子チャットの深さの呼び名: 子・孫・ひ孫、それより深ければ段の数", () => {
  assert.deepEqual([1, 2, 3, 4].map(childDepthLabel), ["子チャット", "孫チャット", "ひ孫チャット", "子チャット（4 段目）"]);
  assert.deepEqual([1, 2, 3, 5].map(childDepthShort), ["子", "孫", "ひ孫", "5 段目"]);
});
