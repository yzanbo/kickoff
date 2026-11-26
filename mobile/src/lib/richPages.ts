// スマホのチャットで、数式を含む返答と AI が描いた図（SVG・HTML・Mermaid）を WebView に描くページを組み立てる（純粋な関数）。
// 数式（KaTeX）と Mermaid は、APK を大きくしないよう CDN（cdn.jsdelivr.net）から読む（スマホは本体とつなぐのにネットワークを使う）。
// 数式・Mermaid のページの CSP は、本体のスクリプト（と KaTeX の CSS・フォント）だけを CDN から読ませ、画像は data: と blob: だけにする
// （CDN は GitHub のファイルも配れるので、図の書き方（参加者の icon・形の img・CSS の url）で読む画像を許すと、見たことが外に伝わる）。
// 高さは React Native へ知らせる
import { isolatedFrameCsp } from "@shared/foundation/isolatedFrame";
import { mathRanges } from "@shared/foundation/markdown/mathGuard";
import { LENGTH_MACROS_SCRIPT } from "@shared/foundation/math/katexLengths";
import {
  DISPLAY_MATH_MAX_EM,
  INLINE_MATH_MAX_EM,
  KATEX_SETTINGS,
  KATEX_TEXT_MACROS,
  KATEX_VERSION,
  SEE_THROUGH_CLASS,
  TALL_MATH_CLASS,
  TIDY_KATEX_SCRIPT,
} from "@shared/foundation/math/katexSettings";
import { MERMAID_SAFE_CONFIG, MERMAID_VERSION, mermaidReadsOutside } from "@shared/foundation/mermaidResources";
import { SANITIZE_SVG_SCRIPT } from "@shared/foundation/mermaidSvg";
import { VISUAL_MESSAGES, visualDocument, visualThemeCss, type VisualThemeValues } from "@shared/visuals/visualDocument";
import { colors } from "../ui/colors";

/** KaTeX と Mermaid を読む CDN と版（CDN の URL に入れる。どちらもパソコンと同じ版） */
const CDN = "https://cdn.jsdelivr.net";
const KATEX = `${CDN}/npm/katex@${KATEX_VERSION}/dist`;
const MERMAID = `${CDN}/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`;

/** 本体のスクリプト（ページに書いたものと CDN のもの） */
const PAGE_SCRIPTS = ["'unsafe-inline'", "'unsafe-eval'", CDN];
/** 数式のページの CSP（KaTeX の CSS とフォントも CDN から） */
const MATH_PAGE_CSP = isolatedFrameCsp({ script: PAGE_SCRIPTS, style: ["'unsafe-inline'", CDN], img: ["data:", "blob:"], font: ["data:", CDN] });
/** Mermaid のページの CSP（図が書く CSS・画像・フォントは外を読めない。スタイルは Mermaid が SVG に書くものだけ） */
const MERMAID_PAGE_CSP = isolatedFrameCsp({ script: PAGE_SCRIPTS, style: ["'unsafe-inline'"], img: ["data:", "blob:"], font: ["data:"] });

/** Mermaid の設定（守りの設定はパソコンと同じ。図の中の前書き・%%{init}%% から HTML のラベル・配色・CSS・字体を変えさせない） */
const MERMAID_CONFIG = {
  ...MERMAID_SAFE_CONFIG,
  theme: "dark",
};

/** スマホの配色の図の変数（アプリはダークだけ） */
export const MOBILE_VISUAL_THEME: VisualThemeValues = {
  "--vis-bg": colors.bg,
  "--vis-surface": colors.elev,
  "--vis-text": colors.text,
  "--vis-muted": colors.muted,
  "--vis-border": colors.border,
  "--vis-accent": colors.accent,
  "--vis-accent-text": "#ffffff",
  "--vis-danger": colors.ng,
  "--vis-chart-1": colors.accent,
  "--vis-chart-2": colors.ok,
  "--vis-chart-3": colors.warn,
  "--vis-chart-4": "#e39bc0",
  "--vis-chart-5": colors.ng,
  "--vis-chart-6": "#9ccf7a",
  "--vis-font": "sans-serif",
  "--vis-mono": "monospace",
  "--vis-radius": "8px",
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** 高さを React Native へ知らせる（中身が変わるたびに） */
const SIZE_SCRIPT = `(() => {
  let last = -1;
  const report = () => {
    const h = Math.ceil(document.body.getBoundingClientRect().bottom + window.scrollY);
    if (h !== last && window.ReactNativeWebView) { last = h; window.ReactNativeWebView.postMessage(JSON.stringify({ type: ${JSON.stringify(VISUAL_MESSAGES.size)}, height: h })); }
  };
  addEventListener("load", report);
  // この文は head の中で動き、まだ body がないので、文書を読み終えてから見張る
  addEventListener("DOMContentLoaded", () => new ResizeObserver(report).observe(document.body));
  setTimeout(report, 300);
})();`;

/** 数式・Mermaid のページの頭（CSP・配色・高さの知らせ） */
function pageHead(csp: string, extra: string): string {
  return [
    `<meta charset="utf-8">`,
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<style>${visualThemeCss(MOBILE_VISUAL_THEME)}
html, body { margin: 0; background: var(--vis-bg); color: var(--vis-text); font-family: var(--vis-font); font-size: 15px; line-height: 1.5; overflow-y: hidden; }
body { padding: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.katex-display { overflow-x: auto; overflow-y: auto; max-height: ${DISPLAY_MATH_MAX_EM}em; margin: 0.4em 0; }
.katex.${TALL_MATH_CLASS} { display: inline-block; max-height: ${INLINE_MATH_MAX_EM}em; overflow: hidden; vertical-align: middle; }</style>`,
    extra,
    `<script>${SIZE_SCRIPT}</script>`,
  ].join("\n");
}

/** 返答に数式があるか（あれば WebView で描く） */
export const hasMath = (text: string) => mathRanges(text).length > 0;

/**
 * 数式を含む返答のページ（文はそのまま、数式の場所（`@shared/markdown/mathGuard` の mathRanges。パソコンと同じ決まり）だけを KaTeX で描く）。
 * KaTeX が読めないときは、書いたとおりの式のまま
 */
export function mathPage(text: string): string {
  let body = "";
  let at = 0;
  for (const m of mathRanges(text)) {
    body += escapeHtml(text.slice(at, m.from));
    body += `<span class="tex" data-display="${m.display ? "1" : ""}" data-tex="${escapeHtml(m.tex)}">${escapeHtml(text.slice(m.from, m.to))}</span>`;
    at = m.to;
  }
  body += escapeHtml(text.slice(at));
  // 設定・文字のマクロ・長さのマクロ・描いたあとの整え・式の箱の外を描かない CSS はパソコンと同じ（@shared/foundation/math。長さのマクロは式ごとに作り直す）
  const render = `<link rel="stylesheet" href="${KATEX}/katex.min.css"><script src="${KATEX}/katex.min.js"></script>
<style>.${SEE_THROUGH_CLASS} { user-select: none; -webkit-user-select: none; } .katex .katex-base { clip-path: inset(-0.25em); }</style>
<script>${LENGTH_MACROS_SCRIPT}
${TIDY_KATEX_SCRIPT}
const KATEX_SETTINGS = ${JSON.stringify(KATEX_SETTINGS)};
const KATEX_TEXT_MACROS = ${JSON.stringify(KATEX_TEXT_MACROS)};
addEventListener("DOMContentLoaded", () => {
  if (!window.katex) return;
  for (const el of document.querySelectorAll(".tex")) {
    try {
      katex.render(el.dataset.tex, el, { ...KATEX_SETTINGS, displayMode: el.dataset.display === "1", macros: { ...KATEX_TEXT_MACROS, ...kickoffLengthMacros() } });
      kickoffTidyKatex(el);
    } catch {}
  }
});</script>`;
  return `<!doctype html><html><head>${pageHead(MATH_PAGE_CSP, render)}</head><body>${body}</body></html>`;
}

/** 描けなかった理由を React Native へ知らせる関数 fail をページに置く */
const FAIL_SCRIPT = `const fail = (message) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: ${JSON.stringify(VISUAL_MESSAGES.error)}, message }));`;

/**
 * Mermaid の図のページ（読めない・書き方の誤りなら、書いたとおりの文のまま、理由を React Native へ知らせる）。
 * 描く途中で外を読む書き方の図は Mermaid を読まずに断る（パソコンと同じ判定）。描いた SVG はパソコンと同じ決まりで整えてから置く
 * （リンク・外を指す属性・foreignObject・on… の属性・外を読む CSS を外す。リンクを押して確かめずにブラウザが開かないように）
 */
export function mermaidPage(code: string): string {
  const render = mermaidReadsOutside(code)
    ? `<script>${FAIL_SCRIPT}
addEventListener("DOMContentLoaded", () => fail("外の画像・CSS を読む図は描きません"));</script>`
    : `<script src="${MERMAID}"></script>
<script>${SANITIZE_SVG_SCRIPT}
${FAIL_SCRIPT}
addEventListener("DOMContentLoaded", async () => {
  if (!window.mermaid) return fail("Mermaid を読み込めませんでした（ネットワークを確かめてください）");
  mermaid.initialize(${JSON.stringify(MERMAID_CONFIG)});
  const el = document.getElementById("src");
  try {
    const { svg } = await mermaid.render("m1", el.textContent);
    // 文書に入れる前に template の中で整える（文書の外なので、整える前に画像などを読みに行かない）
    const template = document.createElement("template");
    template.innerHTML = svg;
    const root = template.content.firstElementChild;
    if (!root || root.localName !== "svg") throw new Error("図の SVG を読めませんでした");
    mermaidSanitizeSvgTree(root, () => document.createElementNS("http://www.w3.org/2000/svg", "g"));
    const box = document.createElement("div");
    box.className = "diagram";
    box.append(root);
    el.replaceWith(box);
  } catch (e) { fail("図を描けませんでした: " + String((e && e.message) || e)); }
});</script>`;
  const style = `<style>body { white-space: normal; } #src { white-space: pre; font-family: var(--vis-mono); font-size: 12px; } .diagram svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }</style>`;
  return `<!doctype html><html><head>${pageHead(MERMAID_PAGE_CSP, render + "\n" + style)}</head><body><div id="src">${escapeHtml(code)}</div></body></html>`;
}

/** SVG・HTML の図のページ（パソコンと同じページに、CSP の meta とスマホの配色）。maxHeight: 高さの上限（超えたら中でスクロール） */
export const visualPage = (kind: "svg" | "html", code: string, maxHeight?: number) =>
  visualDocument({ kind, code, vars: MOBILE_VISUAL_THEME, csp: true, ...(maxHeight !== undefined ? { maxHeight } : {}) });
