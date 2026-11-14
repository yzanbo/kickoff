import assert from "node:assert/strict";
import { test } from "node:test";
import { VISUAL_FRAME_CSP, VISUAL_LIGHT_THEME, visualDocument, visualMemoHtml, visualThemeCss } from "./visualDocument";

test("visualThemeCss: 決めた変数だけを :root に置き、値の中の ; { } < は捨てる", () => {
  const css = visualThemeCss({ "--vis-bg": "#fff", "--vis-text": "red; } body { display: none", ...({ "--evil": "#000" } as object) });
  assert.equal(css, ":root { --vis-bg: #fff; }");
});

test("visualDocument: SVG は本文に、HTML のページ全体は頭の印を外して置き、補助と CSP（頼んだときだけ）を頭に入れる", () => {
  const svg = visualDocument({ kind: "svg", code: "<svg viewBox='0 0 1 1'></svg>", vars: VISUAL_LIGHT_THEME });
  assert.match(svg, /^<!doctype html>/);
  assert.match(svg, /<body>\n<svg viewBox='0 0 1 1'><\/svg>\n<\/body>/);
  assert.match(svg, /window\.sendPrompt/);
  assert.match(svg, /--vis-bg: #ffffff;/);
  assert.doesNotMatch(svg, /Content-Security-Policy/);
  const html = visualDocument({ kind: "html", code: "<!DOCTYPE html><html><head><title>x</title></head><body>本文</body></html>", vars: {}, csp: true });
  assert.equal(html.match(/<!doctype/gi)?.length, 1);
  assert.ok(html.includes(`content="${VISUAL_FRAME_CSP}"`));
  // 高さの上限を渡すと、上限より低い中身では縦のスクロールバーを出さない
  assert.match(visualDocument({ kind: "svg", code: "<svg/>", vars: {}, maxHeight: 600.4 }), /const MAX = 600;/);
  assert.match(visualDocument({ kind: "svg", code: "<svg/>", vars: {} }), /const MAX = Infinity;/);
});

test("VISUAL_FRAME_CSP: 決めた CDN のほかへは通信せず、フォーム・枠・base を止める", () => {
  assert.match(VISUAL_FRAME_CSP, /default-src 'none'/);
  assert.match(VISUAL_FRAME_CSP, /connect-src 'none'/);
  assert.match(VISUAL_FRAME_CSP, /script-src 'unsafe-inline' 'unsafe-eval' https:\/\/cdn\.jsdelivr\.net/);
  assert.match(VISUAL_FRAME_CSP, /form-action 'none'/);
});

test("visualMemoHtml: 明るいテーマの値を置いた HTML のメモにする（題名は逃がす）", () => {
  const memo = visualMemoHtml("<構成>", "<svg/>");
  assert.match(memo, /<title>&lt;構成&gt;<\/title>/);
  assert.match(memo, /--vis-bg: #ffffff;/);
  assert.match(memo, /<body>\n<svg\/>\n<\/body>/);
});
