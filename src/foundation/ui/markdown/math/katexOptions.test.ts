import assert from "node:assert/strict";
import { test } from "vitest";
import katex from "katex";
import { renderToStaticMarkup } from "react-dom/server";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { PluggableList } from "unified";
import { createPipeline, renderMarkdown } from "@/foundation/ui/markdown/markdownProcessor";
import { isHiddenMathml, isSeeThroughStyle, KATEX_OPTIONS, rehypeSafeMath } from "./katexOptions";

/** 見た目の HTML の部分（読み上げ用の MathML と、書いた式の annotation は画面に出ないので除く） */
const visible = (html: string) => html.slice(html.indexOf('<span class="katex-html"'));
/** 返答と同じ組（rehype-katex のあとに rehypeSafeMath）で描いた HTML */
const pipeline = createPipeline([[remarkMath, { singleDollarTextMath: true }]] as PluggableList, [[rehypeKatex, KATEX_OPTIONS], rehypeSafeMath] as PluggableList);
const render = (tex: string) => renderToStaticMarkup(renderMarkdown(pipeline, ["$", tex, "$"].join(""), {}));

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

test("見えない文字（phantom・transparent・#0000）は見えないまま場所を取り、選べない・コピーに入らない形にする", () => {
  for (const tex of [String.raw`a\phantom{secret}b`, String.raw`\color{transparent}{secret}`, String.raw`\color{transparent}\text{secret}`, String.raw`\textcolor{#0000}{secret}`]) {
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
  // 色の付いた見える文字・色の付いた背景はそのまま
  assert.doesNotMatch(render(String.raw`\color{red}{x}`), /katex-see-through/);
  assert.doesNotMatch(render(String.raw`\colorbox{transparent}{x}`), /katex-see-through/);
});

test("KaTeX の出力: 書いた大きさは maxSize（10em）で丸める。外へ出るものは trust: false で止める", () => {
  const html = (tex: string) => visible(katex.renderToString(tex, KATEX_OPTIONS));
  assert.match(html(String.raw`\rule{500em}{500em}`), /border-right-width:10em;border-top-width:10em/);
  assert.doesNotMatch(html(String.raw`\rule{500em}{500em}`), /500em/);
  assert.doesNotMatch(html(String.raw`\href{https://evil.example/}{x}`), /<a /);
  assert.doesNotMatch(html(String.raw`\htmlStyle{color:transparent}{x}`), /transparent/);
});
