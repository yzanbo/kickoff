import { test } from "vitest";
import assert from "node:assert/strict";
import { draftDisplayTitle } from "./draftTitle";

test("下書きの表示名は手動の名前、本文の最初の空でない行、New Chat の順", () => {
  assert.equal(draftDisplayTitle(undefined, undefined), "New Chat");
  assert.equal(draftDisplayTitle(undefined, " \n\t"), "New Chat");
  assert.equal(draftDisplayTitle(undefined, " \r\n  はじめの行  \r\n次の行"), "はじめの行");
  assert.equal(draftDisplayTitle(undefined, "一行目\r二行目"), "一行目");
  assert.equal(draftDisplayTitle("付けた名前", "本文"), "付けた名前");
  assert.equal(draftDisplayTitle(undefined, ""), "New Chat");
});
