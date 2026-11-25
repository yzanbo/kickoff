import assert from "node:assert/strict";
import { test } from "vitest";
import katex from "katex";
import { KATEX_OPTIONS, safeMathHtml, safeMathStyle } from "./katexOptions";

/** 見た目の HTML の部分（読み上げ用の MathML と、書いた式の annotation は画面に出ないので除く） */
const render = (tex: string) => {
  const html = safeMathHtml(katex.renderToString(tex, KATEX_OPTIONS));
  return html.slice(html.indexOf('<span class="katex-html"'));
};

test("safeMathStyle: 透明・透明度のある色だけを外す（ほかの色・大きさはそのまま）", () => {
  assert.equal(safeMathStyle("color:transparent;"), "");
  assert.equal(safeMathStyle("color:#0000;margin-right:1em;"), "margin-right:1em;");
  assert.equal(safeMathStyle("background-color:#ff000080;border-color: TRANSPARENT ;height:1em;"), "height:1em;");
  assert.equal(safeMathStyle("color:#ff0000;"), "color:#ff0000;");
  assert.equal(safeMathStyle("color:red;"), "color:red;");
  assert.equal(safeMathStyle("height:0.6944em;"), "height:0.6944em;");
});

test("KaTeX の出力: \\color{transparent}・\\textcolor{#0000} で見えない文字を書けない", () => {
  for (const tex of [String.raw`\color{transparent}{secret}`, String.raw`\textcolor{#0000}{secret}`, String.raw`\textcolor{#00000000}{secret}`, String.raw`\colorbox{transparent}{x}`]) {
    const html = render(tex);
    assert.doesNotMatch(html, /transparent|#0000/i, tex);
  }
  // ふつうの色は残す
  assert.match(render(String.raw`\color{red}{x}`), /color:red/);
});

test("KaTeX の出力: 書いた大きさは maxSize（10em）で丸める。外へ出るものは trust: false で止める", () => {
  assert.match(render(String.raw`\rule{500em}{500em}`), /border-right-width:10em;border-top-width:10em/);
  assert.doesNotMatch(render(String.raw`\rule{500em}{500em}`), /500em/);
  assert.doesNotMatch(render(String.raw`\href{https://evil.example/}{x}`), /<a /);
  assert.doesNotMatch(render(String.raw`\htmlStyle{color:transparent}{x}`), /transparent/);
});
