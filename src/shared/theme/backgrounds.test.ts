import assert from "node:assert/strict";
import { test } from "vitest";
import { backgroundFor, parseThemeChoice, THEME_BACKGROUNDS } from "./backgrounds";

test("窓の地の色: ダーク・ライト・システム（OS のダーク・ライト）の 3 × 2 通り", () => {
  assert.equal(backgroundFor("dark", false), THEME_BACKGROUNDS.dark);
  assert.equal(backgroundFor("dark", true), THEME_BACKGROUNDS.dark);
  assert.equal(backgroundFor("light", false), THEME_BACKGROUNDS.light);
  assert.equal(backgroundFor("light", true), THEME_BACKGROUNDS.light);
  assert.equal(backgroundFor("system", true), THEME_BACKGROUNDS.dark);
  assert.equal(backgroundFor("system", false), THEME_BACKGROUNDS.light);
});

test("覚えたテーマの読み取り: 知らない値・文字でないものは null", () => {
  assert.equal(parseThemeChoice("light"), "light");
  assert.equal(parseThemeChoice("system"), "system");
  assert.equal(parseThemeChoice("sepia"), null);
  assert.equal(parseThemeChoice(undefined), null);
  assert.equal(parseThemeChoice(1), null);
});
