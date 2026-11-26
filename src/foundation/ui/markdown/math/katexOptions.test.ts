import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "vitest";
import katex from "katex";
import { renderToStaticMarkup } from "react-dom/server";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { pipelineOf, renderBlock } from "@/foundation/ui/markdown/markdownProcessor";
import { DISPLAY_MATH_MAX_EM, INLINE_MATH_MAX_EM, isHiddenMathml, isSeeThroughStyle, TALL_MATH_CLASS } from "@shared/foundation/math/katexSettings";
import { KATEX_OPTIONS } from "./katexOptions";
import { mathPluginsOf } from "./mathPlugins";

/** 見た目の HTML の部分（読み上げ用の MathML と、書いた式の annotation は画面に出ないので除く） */
const visible = (html: string) => html.slice(html.indexOf('<span class="katex-html"'));
/** 返答と同じ組（mathPluginsOf。rehype-katex のあとに rehypeSafeMath）で描いた HTML */
const pipeline = pipelineOf(undefined, mathPluginsOf(remarkMath, rehypeKatex));
/**
 * 文の中の数式として描く。1 つの $ は英単語（secret）を含む式・記号だけの式を数式と読まない（remarkMathGuard）ので、
 * 決まりを通さずに KaTeX へ渡る文の中の $$…$$ で書く（KaTeX の設定の守りはこちらで確かめる）
 */
const render = (tex: string) => renderToStaticMarkup(renderBlock(pipeline, ["式 $$", tex, "$$"].join(""), {}).element);

test("isSeeThroughStyle: 透明・透明度のある文字色だけ（背景の色・ふつうの色は当たらない）", () => {
  assert.equal(isSeeThroughStyle("color:transparent;"), true);
  assert.equal(isSeeThroughStyle("margin-right:1em;color:#0000;"), true);
  assert.equal(isSeeThroughStyle("color: #ff000080 ;"), true);
  assert.equal(isSeeThroughStyle("color:#ff0000;"), false);
  assert.equal(isSeeThroughStyle("color:red;"), false);
  assert.equal(isSeeThroughStyle("background-color:transparent;"), false);
  assert.equal(isSeeThroughStyle("height:0.6944em;"), false);
  assert.equal(isHiddenMathml("mphantom", undefined), true);
  assert.equal(isHiddenMathml("mstyle", "transparent"), true);
  assert.equal(isHiddenMathml("mstyle", "red"), false);
});

test("見えない文字（phantom）は見えないまま場所を取り、選べない・コピーに入らない形にする", () => {
  for (const tex of [String.raw`a\phantom{secret}b`, String.raw`\phantom{\text{secret}}`]) {
    const html = render(tex);
    // 見た目は変えない（透明のまま）。透明な文字の要素には、選べないクラスと aria-hidden を付ける
    const hidden = visible(html).match(/<span [^>]*color:(transparent|#0000)[^>]*>/g) ?? [];
    assert.ok(hidden.length > 0, tex);
    for (const tag of hidden) {
      assert.match(tag, /class="[^"]*katex-see-through/, tex);
      assert.match(tag, /aria-hidden="true"/, tex);
    }
    // 読み上げ用の MathML（選ぶとコピーに入る）には見えない文字を残さない。書いた式の annotation は残る
    const mathml = html.slice(html.indexOf("<math"), html.indexOf("<annotation"));
    assert.doesNotMatch(mathml, />[sc]</, tex);
    assert.doesNotMatch(mathml, /secret/, tex);
    assert.match(html, /<annotation encoding="application\/x-tex">/);
  }
  // 1 つの $ で英単語を隠す書き方は、数式と読まずに書いたままの文字で出る
  assert.equal(renderToStaticMarkup(renderBlock(pipeline, String.raw`$a\phantom{secret}b$`, {}).element), String.raw`<p>$a\phantom{secret}b$</p>`);
});

test("数式で色を変える命令（\\color・\\textcolor・\\colorbox・\\fcolorbox・色の名前の命令）は、色を変えずに中身だけ描く（\\let・\\noexpand・\\def でも戻らない）", () => {
  const forms = [
    String.raw`\color{#141818}{secret}`,
    String.raw`a \color{#141818} secret`,
    String.raw`\textcolor{#141818}{secret}`,
    String.raw`\colorbox{#141818}{secret}`,
    String.raw`\fcolorbox{#141818}{#141818}{secret}`,
    String.raw`\color{transparent}\text{secret}`,
    String.raw`\textcolor{#0000}{secret}`,
    String.raw`\red{secret}`,
    String.raw`\text{\color{#141818}secret}`,
    String.raw`\let\c\textcolor\c{#141818}{secret}`,
    String.raw`\def\c{\textcolor}\c{#141818}{secret}`,
    String.raw`\edef\c{\noexpand\textcolor}\c{#141818}{secret}`,
    String.raw`\noexpand\textcolor{#141818}{secret}`,
    String.raw`\expandafter\textcolor\expandafter{\relax #141818}{secret}`,
  ];
  for (const tex of forms) {
    for (const html of [render(tex), katex.renderToString(tex, { ...KATEX_OPTIONS })]) {
      assert.doesNotMatch(html, /color:(?!inherit)|background|mathcolor|mathbackground|katex-see-through/, tex);
      // 中身は見える文字で出る（書き方の誤りになったものは、書いた式が文字の色のまま出る）
      const shown = html.includes("katex-html") ? visible(html) : html;
      assert.match(shown.replace(/<[^>]+>/g, ""), /secret/, tex);
    }
  }
  // 中身のまとまりは保つ（\textcolor の中身の上付きは中身全体に付く）
  assert.equal(visible(render(String.raw`\textcolor{red}{a+b}^2`)), visible(render(String.raw`{a+b}^2`)));
});

test("数式の文字を小さくするサイズの命令（\\tiny・\\sixptsize・\\scriptsize・\\footnotesize・\\small）は、大きさを変えずに中身だけ描く（\\let・\\noexpand でも戻らない。ノートの描き方も同じ）", () => {
  const forms = ["tiny", "sixptsize", "scriptsize", "footnotesize", "small"].flatMap((name) => [
    `\\${name} secret`,
    `{\\${name}{secret}}`,
    `\\text{\\${name} secret}`,
    `\\let\\s\\${name}\\s secret`,
    `\\def\\s{\\${name}}\\s secret`,
    `\\noexpand\\${name} secret`,
  ]);
  for (const tex of forms) {
    // 返答（rehype-katex）と、ノートのライブプレビュー（liveRich.ts の renderToString に設定を広げて渡す）
    for (const html of [render(tex), katex.renderToString(tex, { ...KATEX_OPTIONS, displayMode: true })]) {
      assert.doesNotMatch(html, /katex-sizing reset-size\d+ size[1-5]\b/, tex);
      assert.match(visible(html).replace(/<[^>]+>/g, ""), /secret/, tex);
    }
  }
  // 大きくする命令と、添え字の縮みは KaTeX のまま
  assert.match(render(String.raw`\large x`), /katex-sizing reset-size6 size7/);
  // 添え字は 0.7 倍、その添え字は合わせて 0.5 倍（reset-size3 size1）
  assert.match(render(String.raw`x_{y_{z}}`), /reset-size6 size3/);
  assert.match(render(String.raw`x_{y_{z}}`), /reset-size3 size1/);
});

test("数式の \\scriptscriptstyle は \\scriptstyle の大きさ（0.7 倍）で描く（\\let・\\def・\\noexpand でも 0.5 倍に戻らない。ノートの描き方も同じ）。入れ子の添え字の自動の縮みは KaTeX のまま", () => {
  for (const tex of [
    String.raw`\scriptscriptstyle\text{secret}`,
    String.raw`{\scriptscriptstyle{\text{secret}}}`,
    String.raw`\let\s\scriptscriptstyle\s\text{secret}`,
    String.raw`\def\s{\scriptscriptstyle}\s\text{secret}`,
    String.raw`\noexpand\scriptscriptstyle\text{secret}`,
  ]) {
    for (const html of [render(tex), katex.renderToString(tex, { ...KATEX_OPTIONS, displayMode: true })]) {
      // 0.5 倍は reset-size6 size1（本文の大きさから）。\scriptstyle は size3
      assert.doesNotMatch(html, /reset-size\d+ size[12]\b/, tex);
      assert.match(visible(html).replace(/<[^>]+>/g, ""), /secret/, tex);
    }
  }
  assert.match(render(String.raw`\scriptscriptstyle x`), /reset-size6 size3/);
  assert.match(render(String.raw`x_{y_{z}}`), /reset-size3 size1/);
});

test("KATEX_OPTIONS: \\gdef で定義したマクロは、次の式に残らない（描くたびに macros の新しい写しを渡す）", () => {
  katex.renderToString(String.raw`\gdef\textcolor#1#2{X}\gdef\frac#1#2{Y}`, KATEX_OPTIONS);
  katex.renderToString(String.raw`\gdef\frac#1#2{Y}`, { ...KATEX_OPTIONS });
  assert.doesNotMatch(visible(render(String.raw`\frac{a}{b}`)), />Y</);
  assert.doesNotMatch(visible(katex.renderToString(String.raw`\textcolor{red}{a}`, KATEX_OPTIONS)), />X</);
});

test("KaTeX の出力: 書いた大きさは丸める（横は maxSize の 10em、縦は katexLengths.ts の 3em）。外へ出るものは trust: false で止める", () => {
  const html = (tex: string) => visible(katex.renderToString(tex, KATEX_OPTIONS));
  assert.match(html(String.raw`\rule{500em}{500em}`), /border-right-width:10em;border-top-width:3em/);
  assert.doesNotMatch(html(String.raw`\rule{500em}{500em}`), /500em/);
  assert.doesNotMatch(html(String.raw`\href{https://evil.example/}{x}`), /<a /);
  assert.doesNotMatch(html(String.raw`\htmlStyle{color:transparent}{x}`), /transparent/);
});

/** 返答の数式の CSS（katex.vendor.css が読む KaTeX の CSS と、Markdown.css） */
const katexCss = readFileSync(createRequire(import.meta.url).resolve("katex/dist/katex.min.css"), "utf8");
const markdownCss = readFileSync(new URL("../Markdown.css", import.meta.url), "utf8");

test("返答の数式（rehype-katex）は、読み込む CSS と同じ版の KaTeX で描く（クラス名が CSS にある）", () => {
  const html = visible(render(String.raw`\frac{a}{b} + x^2`));
  for (const name of ["katex-base", "katex-strut"]) {
    assert.match(html, new RegExp(`class="${name}"`), name);
    assert.ok(katexCss.includes(`.${name}`), name);
  }
  // 古い版のクラス名（base・strut）は出ない
  assert.doesNotMatch(html, /class="(base|strut)"/);
});

test("返答の数式も、式の箱（.katex-base）の外へ出た分を描かない（負の kern・raisebox）", () => {
  assert.match(markdownCss, /\.markdown \.katex \.katex-base \{\s*clip-path: inset\(-0\.25em\);/);
  for (const tex of [String.raw`a\kern-50em b`, String.raw`\raisebox{-30em}{x}`]) {
    const html = visible(render(tex));
    // ずらしたもの（負の余白・下げた箱）が、切り取る .katex-base の中にある
    const base = html.indexOf('class="katex-base"');
    const moved = html.search(/margin-right:-10em|vertical-align:-3em/);
    assert.ok(base >= 0 && moved > base, tex);
  }
});

test("式の箱の縦の上限: 長さの命令でない形（\\arraystretch・空の行）で高すぎる行の中の式に印を付け、CSS がその高さで切る・段落の式はスクロール", () => {
  const block = (tex: string) => renderToStaticMarkup(renderBlock(pipeline, ["$$", tex, "$$"].join("\n"), {}).element);
  const rows = (n: number) => Array.from({ length: n }, (_, i) => `a_{${i}} & b`).join(String.raw`\\`);
  for (const tex of [String.raw`\def\arraystretch{50}\begin{matrix}a\\b\end{matrix}`, `\\begin{matrix}${String.raw`\\`.repeat(100)}\\end{matrix}`]) {
    assert.match(render(tex), new RegExp(`class="katex ${TALL_MATH_CLASS}"`), tex);
    // 段落の式には付けない（CSS の max-height とスクロールで収める）
    assert.doesNotMatch(block(tex), new RegExp(TALL_MATH_CLASS), tex);
  }
  // ふつうの大きな行列（8 行）・分数の重なり・行の中の連立は切らない
  for (const tex of [`\\begin{pmatrix}${rows(8)}\\end{pmatrix}`, String.raw`\dfrac{\dfrac{\dfrac{a}{b}}{c}}{d}`, `\\begin{cases}${rows(5)}\\end{cases}`]) {
    assert.doesNotMatch(render(tex), new RegExp(TALL_MATH_CLASS), tex);
  }
  // CSS の上限は katexSettings.ts の値と同じ（返答とノート）
  const notesCss = readFileSync(new URL("../../../../features/notes/ui/document/NoteEditor.unlayered.css", import.meta.url), "utf8");
  for (const css of [markdownCss, notesCss]) {
    assert.match(css, new RegExp(`(katex-display|cm-md-math-display) \\{[^}]*max-height: ${DISPLAY_MATH_MAX_EM}em;[^}]*overflow-y: auto;`));
    assert.match(css, new RegExp(`\\.katex\\.${TALL_MATH_CLASS} \\{[^}]*max-height: ${INLINE_MATH_MAX_EM}em;[^}]*overflow: hidden;`));
  }
});
