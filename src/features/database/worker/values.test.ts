// セルの値（toDbValue）: 日時と大きな整数を、ずれも丸めもない文字にする
import assert from "node:assert/strict";
import { test } from "vitest";
import { toDbValue } from "./values";

test("toDbValue: 大きな整数は文字列（丸めない）、安全な範囲の整数は数", () => {
  assert.equal(toDbValue(2n ** 60n), "1152921504606846976");
  assert.equal(toDbValue(-(2n ** 60n)), "-1152921504606846976");
  assert.equal(toDbValue(42n), 42);
  assert.equal(toDbValue(BigInt(Number.MAX_SAFE_INTEGER) + 1n), "9007199254740992");
});

test("toDbValue: 日時は文字列のまま返す（ドライバが文字で渡した日時を Date にしない。Date が来ても ISO の文字）", () => {
  // pg は日付・時刻の型を文字のまま受け取る設定（postgres.ts の TYPES）。その文字を作り替えない
  assert.equal(toDbValue("2026-01-02 03:04:05"), "2026-01-02 03:04:05");
  assert.equal(toDbValue("2026-01-02 03:04:05+09"), "2026-01-02 03:04:05+09");
  assert.equal(toDbValue(new Date(Date.UTC(2026, 0, 2, 3, 4, 5))), "2026-01-02T03:04:05.000Z");
  assert.equal(typeof toDbValue(new Date(Number.NaN)), "string");
});
