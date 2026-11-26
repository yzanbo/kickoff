import assert from "node:assert/strict";
import { test } from "vitest";
import katex from "katex";
import { KATEX_OPTIONS } from "./katexOptions";
import { sizeInEm } from "./katexLengths";

/** 式の箱の高さと深さ（em。KaTeX が式ごとに置く支柱 katex-strut の height と vertical-align から。式の中の行ごとの支柱のうち最大） */
function boxOf(tex: string, displayMode: boolean): { height: number; depth: number } {
  const html = katex.renderToString(tex, { ...KATEX_OPTIONS, displayMode });
  let height = 0;
  let depth = 0;
  for (const m of html.matchAll(/class="katex-strut" style="height:([-\d.]+)em;(?:vertical-align:([-\d.]+)em;)?"/g)) {
    const d = -Number(m[2] ?? 0);
    depth = Math.max(depth, d);
    height = Math.max(height, Number(m[1]) - d);
  }
  return { height, depth };
}

/** 長さのマクロを入れない KaTeX の HTML（比べるため） */
const plain = (tex: string, displayMode: boolean) => {
  const { macros, ...rest } = KATEX_OPTIONS;
  const kept = Object.fromEntries(Object.entries(macros).filter(([, v]) => typeof v === "string"));
  return katex.renderToString(tex, { ...rest, macros: kept, displayMode });
};

test("sizeInEm: KaTeX と同じ読み方で、単位を em にする（読めない・知らない単位は null）", () => {
  assert.equal(sizeInEm("-30em"), -30);
  assert.equal(sizeInEm("+ 2 ex"), 0.862);
  assert.equal(sizeInEm("18mu"), 1);
  assert.equal(sizeInEm("10pt"), 1);
  assert.ok(Math.abs((sizeInEm("1cm") ?? 0) - 2.845) < 0.001);
  assert.equal(sizeInEm("abc"), null);
  assert.equal(sizeInEm("3zz"), null);
});

test("長さを取る命令の大きさを抑え、行の中の式・段落の式の箱が本文の行から大きくはみ出さない", () => {
  for (const tex of [
    String.raw`\raisebox{-30em}{Z}`,
    String.raw`\raisebox{30em}{Z}`,
    String.raw`\raisebox{-3em}{\raisebox{-3em}{\raisebox{-3em}{\raisebox{-3em}{\raisebox{-3em}{Z}}}}}`,
    String.raw`\rule{1em}{30em}`,
    String.raw`\rule[-30em]{1em}{1em}`,
    String.raw`\rule[30em]{1em}{1em}`,
    String.raw`\def\d{-30em}\raisebox{\d}{Z}`,
    String.raw`\def\d{-30}\raisebox{\d em}{Z}`,
    String.raw`\let\r\raisebox\r{-30em}{Z}`,
    String.raw`\vphantom{\rule{1em}{30em}}x`,
    String.raw`\genfrac(){30em}{0}{a}{b}`,
    String.raw`{a \above 30em b}`,
    String.raw`\begin{aligned}a\\[-50em]b\end{aligned}`,
    String.raw`\begin{aligned}a\\[50em]b\\[50em]c\end{aligned}`,
    String.raw`\begin{array}{c}a\cr[50em]b\end{array}`,
    String.raw`\raisebox{-30em}{Z}\raisebox{-30em}{Z}\rule[-30em]{1em}{1em}`,
  ]) {
    for (const display of [false, true]) {
      const box = boxOf(tex, display);
      // 縦の大きさは式ごとに合計 10em まで（本文の行 1em に、文字の高さと分数の分を足しても 14em に収まる）
      assert.ok(box.height + box.depth <= 14, `${tex} ${display}: ${JSON.stringify(box)}`);
    }
  }
  // 1 つの \raisebox は 3em まで（行の中の式の深さ）
  assert.ok(boxOf(String.raw`\raisebox{-30em}{Z}`, false).depth <= 3);
  assert.ok(boxOf(String.raw`\kern-50em x`, false).height <= 1);
});

test("横の大きさは ±10em まで（\\hspace{2cm} のような横の空きは今のまま）", () => {
  const html = katex.renderToString(String.raw`a\kern-50em b\hspace{-50em}c\mkern-900mu d`, KATEX_OPTIONS);
  for (const m of html.matchAll(/margin-right:([-\d.]+)em/g)) assert.ok(Number(m[1]) >= -10.0001, m[0]);
  assert.equal(katex.renderToString(String.raw`a\hspace{2cm}b`, KATEX_OPTIONS), plain(String.raw`a\hspace{2cm}b`, false));
});

test("ふつうの式（大きさを書いたものも）は、長さのマクロがあっても同じ HTML に描く", () => {
  for (const tex of [
    String.raw`\frac{a}{b} + \sqrt{x^2+1}`,
    String.raw`\sum_{i=1}^{n} i = \frac{n(n+1)}{2}`,
    String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`,
    String.raw`\begin{aligned} f(x) &= x^2 \\[6pt] g(x) &= \int_0^x f(t)\,dt \\[1em] h &= 1 \end{aligned}`,
    String.raw`\begin{cases} 1 & x > 0 \\ 0 & \text{otherwise} \end{cases}`,
    String.raw`a\qquad b \quad c\;d\!e\hspace{1cm}f\kern-0.5em g\mkern6mu h\hskip 2em i`,
    String.raw`\rule{0pt}{2.5ex}\raisebox{0.5ex}{a}\rule[-1ex]{2pt}{3ex}`,
    String.raw`\genfrac{}{}{0.4pt}{}{a}{b} {a \above 1pt b} x \pmod{3} \colon y \coloneqq z`,
    String.raw`a\\b\\[2ex]c`,
    String.raw`\text{a\\b}`,
  ]) {
    for (const display of [false, true]) assert.equal(katex.renderToString(tex, { ...KATEX_OPTIONS, displayMode: display }), plain(tex, display), tex);
  }
});

test("大きさの書き方の誤りは、長さのマクロがあっても KaTeX の誤りのまま（元の式を出す）", () => {
  for (const tex of [String.raw`\kern x`, String.raw`\raisebox{abc}{Z}`, String.raw`\rule{1zz}{1em}`]) {
    assert.match(katex.renderToString(tex, KATEX_OPTIONS), /katex-error/, tex);
  }
});
