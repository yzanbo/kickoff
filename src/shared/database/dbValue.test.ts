import assert from "node:assert/strict";
import { test } from "node:test";
import { isDbBinary, isDbLongText } from "./dbValue";

test("セルの値の見分け: バイナリ・頭だけの長い文字", () => {
  const bin = { binary: true as const, bytes: 2, head: "0102" };
  const long = { long: true as const, head: "ab", chars: 20_000 };
  assert.equal(isDbBinary(bin), true);
  assert.equal(isDbBinary(long), false);
  assert.equal(isDbBinary(null), false);
  assert.equal(isDbLongText(long), true);
  assert.equal(isDbLongText("x"), false);
});
