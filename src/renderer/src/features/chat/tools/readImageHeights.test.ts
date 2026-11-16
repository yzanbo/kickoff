import assert from "node:assert/strict";
import { test } from "vitest";
import { readImageHeight, readImageKey, rememberReadImageHeight } from "./readImageHeights";

test("描いたときの高さを覚え、0 は覚えない。チャットが違えば別の画像", () => {
  const key = readImageKey(901, "/a/b.png");
  assert.equal(readImageHeight(key), undefined);
  rememberReadImageHeight(key, 0);
  assert.equal(readImageHeight(key), undefined);
  rememberReadImageHeight(key, 212.6);
  assert.equal(readImageHeight(key), 213);
  assert.equal(readImageHeight(readImageKey(902, "/a/b.png")), undefined);
});
