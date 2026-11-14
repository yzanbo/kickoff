// スマホのチャットで、数式を含む返答と AI が描いた図（SVG・HTML・Mermaid）を WebView に描くページを組み立てる（純粋な関数）。
// 数式（KaTeX）と Mermaid は、APK を大きくしないよう CDN（cdn.jsdelivr.net）から読む（スマホは本体とつなぐのにネットワークを使う）。
// どのページも、図の枠と同じ CSP（決めた CDN のほかへは通信しない）で、高さを React Native へ知らせる
import { mathRanges } from "@shared/markdown/mathGuard";
import { VISUAL_FRAME_CSP, VISUAL_MESSAGES, visualDocument, visualThemeCss, type VisualThemeValues } from "@shared/chat/visualDocument";
import { colors } from "../ui/colors";

/** KaTeX と Mermaid の版（CDN の URL に入れる） */
const KATEX = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist";
const MERMAID = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";

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
  new ResizeObserver(report).observe(document.body);
  setTimeout(report, 300);
})();`;

/** 数式・Mermaid のページの頭（CSP・配色・高さの知らせ） */
function pageHead(extra: string): string {
  return [
    `<meta charset="utf-8">`,
    `<meta http-equiv="Content-Security-Policy" content="${VISUAL_FRAME_CSP}">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<style>${visualThemeCss(MOBILE_VISUAL_THEME)}
html, body { margin: 0; background: var(--vis-bg); color: var(--vis-text); font-family: var(--vis-font); font-size: 15px; line-height: 1.5; overflow-y: hidden; }
body { padding: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.katex-display { overflow-x: auto; overflow-y: hidden; margin: 0.4em 0; }</style>`,
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
  const render = `<link rel="stylesheet" href="${KATEX}/katex.min.css"><script src="${KATEX}/katex.min.js"></script>
<script>addEventListener("DOMContentLoaded", () => { if (!window.katex) return; for (const el of document.querySelectorAll(".tex")) { try { katex.render(el.dataset.tex, el, { displayMode: el.dataset.display === "1", throwOnError: false, errorColor: "inherit", strict: false }); } catch {} } });</script>`;
  return `<!doctype html><html><head>${pageHead(render)}</head><body>${body}</body></html>`;
}

/** Mermaid の図のページ（読めない・書き方の誤りなら、書いたとおりの文のまま） */
export function mermaidPage(code: string): string {
  const render = `<script src="${MERMAID}"></script>
<script>addEventListener("DOMContentLoaded", async () => {
  if (!window.mermaid) return;
  mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });
  const el = document.getElementById("src");
  try { const { svg } = await mermaid.render("m1", el.textContent); el.outerHTML = '<div class="diagram">' + svg + '</div>'; } catch {}
});</script>
<style>body { white-space: normal; } #src { white-space: pre; font-family: var(--vis-mono); font-size: 12px; } .diagram svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }</style>`;
  return `<!doctype html><html><head>${pageHead(render)}</head><body><div id="src">${escapeHtml(code)}</div></body></html>`;
}

/** SVG・HTML の図のページ（パソコンと同じページに、CSP の meta とスマホの配色） */
export const visualPage = (kind: "svg" | "html", code: string) => visualDocument({ kind, code, vars: MOBILE_VISUAL_THEME, csp: true });
