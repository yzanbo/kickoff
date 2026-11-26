import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { INLINE_MATH_MAX_EM, KATEX_SETTINGS, KATEX_TEXT_MACROS, KATEX_VERSION, katexBoxEm } from "./katexSettings";

test("KATEX_VERSION: パソコンが読む katex の版と同じ（スマホは CDN からこの版を読む）", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../../../node_modules/katex/package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(pkg.version, KATEX_VERSION);
});

test("KATEX_SETTINGS・KATEX_TEXT_MACROS: JSON にしても同じ（スマホのページに文字で入れる）", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(KATEX_SETTINGS)), KATEX_SETTINGS);
  assert.deepEqual(JSON.parse(JSON.stringify(KATEX_TEXT_MACROS)), KATEX_TEXT_MACROS);
  assert.equal(KATEX_SETTINGS.trust, false);
  assert.ok("\\color" in KATEX_TEXT_MACROS && "\\tiny" in KATEX_TEXT_MACROS && "\\scriptscriptstyle" in KATEX_TEXT_MACROS);
});

test("katexBoxEm: 支柱の高さと深さから式の箱の縦の大きさ（行が分かれた式は上と下の最大）", () => {
  assert.equal(katexBoxEm(["height:1.0404em;vertical-align:-0.345em;"]), 1.0404);
  assert.equal(katexBoxEm(["height:0.4306em;"]), 0.4306);
  assert.equal(katexBoxEm(["height:120em;vertical-align:-59.75em;"]), 120);
  assert.equal(katexBoxEm(["height:2em;vertical-align:-1em;", "height:3em;"]), 4);
  assert.equal(katexBoxEm([]), 0);
  // 行の中の式の上限は、高すぎる行列（120em）より低く、8 行の行列（9.6em）より高い
  assert.ok(katexBoxEm(["height:120em;vertical-align:-59.75em;"]) > INLINE_MATH_MAX_EM && katexBoxEm(["height:9.6em;vertical-align:-4.55em;"]) <= INLINE_MATH_MAX_EM);
});
