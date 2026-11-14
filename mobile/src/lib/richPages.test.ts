import assert from "node:assert/strict";
import { test } from "node:test";
import { VISUAL_FRAME_CSP } from "@shared/chat/visualDocument";
import { hasMath, mathPage, mermaidPage, visualPage } from "./richPages";

test("hasMath: パソコンと同じ決まりで、数式があるときだけ WebView にする", () => {
  assert.ok(hasMath("面積は $\\pi r^2$"));
  assert.ok(hasMath("$$E=mc^2$$"));
  assert.ok(!hasMath("月 $5 から $20 に上げる"));
  assert.ok(!hasMath("`$x$` はコード"));
});

test("mathPage: 文は逃がしてそのまま、数式の場所だけを KaTeX で描く印にする。CSP は図の枠と同じ", () => {
  const page = mathPage("<b>注意</b> 面積は $\\pi r^2$\n$$\nE=mc^2\n$$");
  assert.ok(page.includes("&lt;b&gt;注意&lt;/b&gt;"));
  assert.match(page, /<span class="tex" data-display="" data-tex="\\pi r\^2">\$\\pi r\^2\$<\/span>/);
  assert.match(page, /data-display="1" data-tex="E=mc\^2"/);
  assert.ok(page.includes(`content="${VISUAL_FRAME_CSP}"`));
  assert.match(page, /cdn\.jsdelivr\.net\/npm\/katex/);
});

test("mermaidPage・visualPage: Mermaid は書いた文を逃がして置き、SVG・HTML はパソコンと同じページに CSP とスマホの配色", () => {
  assert.match(mermaidPage("flowchart LR\nA-->B<script>"), /<div id="src">flowchart LR\nA--&gt;B&lt;script&gt;<\/div>/);
  const svg = visualPage("svg", "<svg/>");
  assert.ok(svg.includes(`content="${VISUAL_FRAME_CSP}"`));
  assert.match(svg, /--vis-bg: #1b1f20;/);
  assert.match(svg, /ReactNativeWebView/);
});
