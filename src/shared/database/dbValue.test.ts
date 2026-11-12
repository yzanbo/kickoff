import assert from "node:assert/strict";
import { test } from "node:test";
import { dbImageType, isDbBinary, isDbLongText } from "./dbValue";

test("セルの値の見分け: バイナリ・頭だけの長い文字", () => {
  const bin = { binary: true as const, bytes: 2, head: "0102" };
  const long = { long: true as const, head: "ab", chars: 20_000 };
  assert.equal(isDbBinary(bin), true);
  assert.equal(isDbBinary(long), false);
  assert.equal(isDbBinary(null), false);
  assert.equal(isDbLongText(long), true);
  assert.equal(isDbLongText("x"), false);
});

test("dbImageType: 頭のバイトで PNG・JPEG・GIF・WebP を見分ける（ほかは null）", () => {
  assert.equal(dbImageType("89504E470D0A1A0A0000000D49484452"), "image/png");
  assert.equal(dbImageType("ffd8ffe000104a464946"), "image/jpeg");
  assert.equal(dbImageType("47494638396101000100"), "image/gif");
  assert.equal(dbImageType("524946462400000057454250565038"), "image/webp");
  assert.equal(dbImageType("52494646240000004156492020"), null);
  assert.equal(dbImageType("3c737667"), null);
  assert.equal(dbImageType(""), null);
});
