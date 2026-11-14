// AI が描いた図（SVG・HTML）を閉じた枠（sandbox の iframe・スマホの WebView）に入れる 1 枚のページを組み立てる。
// 画面とスマホで同じページにする。ページの中から外へは、決めた CDN のほかに通信できず（CSP）、Kickoff の画面・API・保存にも触れない。
// 外へ知らせるのは postMessage の決まった形だけ（高さ・失敗・利用者が押したときの発言）
import { VISUAL_CDN_ORIGINS, VISUAL_THEME_VARS } from "./aiVisual";

/** 図のページの CSP（スクリプトとスタイルは中に書いたものと決めた CDN だけ・画像とフォントは data: と CDN・通信はしない） */
export const VISUAL_FRAME_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' ${VISUAL_CDN_ORIGINS.join(" ")}`,
  `style-src 'unsafe-inline' ${VISUAL_CDN_ORIGINS.join(" ")}`,
  `img-src data: blob: ${VISUAL_CDN_ORIGINS.join(" ")}`,
  `font-src data: ${VISUAL_CDN_ORIGINS.join(" ")}`,
  "media-src data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** 図のページと外の画面のやり取りの種類（postMessage の type） */
export const VISUAL_MESSAGES = {
  /** 枠のページ（/visual-frame）が中身を受け取れるようになった（中 → 外） */
  ready: "kickoff-visual-ready",
  /** 中身を描く（外 → 中。html に全体のページ） */
  render: "kickoff-visual-render",
  /** テーマの色を変える（外 → 中。vars に変数の値） */
  theme: "kickoff-visual-theme",
  /** 中身の高さ（中 → 外） */
  size: "kickoff-visual-size",
  /** 描けなかった・止めた理由（中 → 外） */
  error: "kickoff-visual-error",
  /** 利用者が図の中のボタンを押して、このチャットに送る文（中 → 外） */
  prompt: "kickoff-visual-prompt",
} as const;

/** 図の中から送れる発言の長さの上限 */
export const VISUAL_PROMPT_MAX = 10_000;

/** テーマの変数の値（VISUAL_THEME_VARS の名前 → 値） */
export type VisualThemeValues = Partial<Record<(typeof VISUAL_THEME_VARS)[number], string>>;

/** :root に置くテーマの変数（知らない名前・値の中の ; { } < は捨てる） */
export function visualThemeCss(vars: VisualThemeValues): string {
  const known = new Set<string>(VISUAL_THEME_VARS);
  const decls = Object.entries(vars)
    .filter(([name, value]) => known.has(name) && typeof value === "string" && !/[;{}<]/.test(value))
    .map(([name, value]) => `${name}: ${value};`);
  return `:root { ${decls.join(" ")} }`;
}

/**
 * 中のページの補助（高さを知らせる・失敗を知らせる・sendPrompt・テーマを変える）。外の画面は送り主（iframe）で見分ける。
 * maxHeight: 外の枠の高さの上限（中身がそれより低ければ縦のスクロールバーを出さない。出すと横幅が縮んで SVG が低くなり、
 * 消すとまた高くなる、を繰り返してスクロールバーが残るため）。null なら上限なし（全画面・スマホ）
 */
const bridge = (maxHeight: number | null) => `(() => {
  const M = ${JSON.stringify(VISUAL_MESSAGES)};
  const MAX = ${maxHeight === null ? "Infinity" : Math.round(maxHeight)};
  // スマホの WebView の中では React Native へ、パソコンの iframe の中では外の画面へ知らせる
  const post = (data) => (window.ReactNativeWebView ? window.ReactNativeWebView.postMessage(JSON.stringify(data)) : parent.postMessage(data, "*"));
  let last = -1;
  const report = () => {
    const body = document.body;
    if (!body) return;
    const margin = parseFloat(getComputedStyle(body).marginBottom) || 0;
    const height = Math.ceil(body.getBoundingClientRect().bottom + margin + window.scrollY);
    if (MAX !== Infinity) document.documentElement.style.overflowY = height <= MAX ? "hidden" : "auto";
    if (height !== last) { last = height; post({ type: M.size, height }); }
  };
  addEventListener("load", report);
  new ResizeObserver(report).observe(document.documentElement);
  addEventListener("DOMContentLoaded", () => { report(); new ResizeObserver(report).observe(document.body); });
  // 大きさが変わった知らせの取りこぼし（ResizeObserver loop …）はブラウザの注意で、描くのには関係ないので知らせない
  addEventListener("error", (e) => { if (!/ResizeObserver loop/.test(String(e.message))) post({ type: M.error, message: String(e.message || "スクリプトの失敗") }); });
  addEventListener("unhandledrejection", (e) => post({ type: M.error, message: String((e.reason && e.reason.message) || e.reason || "スクリプトの失敗") }));
  addEventListener("securitypolicyviolation", (e) => post({ type: M.error, message: "外への読み込み・通信を止めました: " + (e.blockedURI || e.violatedDirective) }));
  addEventListener("message", (e) => {
    if (e.source !== parent || !e.data || e.data.type !== M.theme) return;
    for (const [name, value] of Object.entries(e.data.vars || {})) document.documentElement.style.setProperty(name, String(value));
  });
  // 利用者が押したときだけ送る（読み込んだだけ・タイマーからは送らない）
  window.sendPrompt = (text) => {
    const active = navigator.userActivation ? navigator.userActivation.isActive : false;
    if (!active) { post({ type: M.error, message: "sendPrompt は、利用者がボタンを押したときだけ使えます" }); return false; }
    post({ type: M.prompt, text: String(text).slice(0, ${VISUAL_PROMPT_MAX}) });
    return true;
  };
})();`;

/** 中身の前に置く地のスタイル（AI が書いたスタイルが後ろにあれば、そちらが勝つ） */
const BASE_STYLE = `html { color-scheme: light dark; }
html, body { margin: 0; background: var(--vis-bg); color: var(--vis-text); font-family: var(--vis-font); font-size: 14px; line-height: 1.6; }
body { padding: 12px; overflow-wrap: anywhere; }
body > svg:only-child { display: block; max-width: 100%; height: auto; margin: 0 auto; }
img, canvas, video { max-width: 100%; }`;

/**
 * 図のページの全体（SVG は本文に入れ、HTML は断片でも 1 枚のページ全体でも、補助・地のスタイル・テーマの変数の後ろに置く）。
 * csp: ページに CSP の meta を入れる（スマホの WebView。パソコンは枠のページの応答の見出しで付ける）。maxHeight: 外の枠の高さの上限
 */
export function visualDocument(input: { kind: "svg" | "html"; code: string; vars: VisualThemeValues; csp?: boolean; maxHeight?: number }): string {
  const head = [
    `<meta charset="utf-8">`,
    ...(input.csp ? [`<meta http-equiv="Content-Security-Policy" content="${VISUAL_FRAME_CSP}">`] : []),
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<style>${visualThemeCss(input.vars)}\n${BASE_STYLE}</style>`,
    `<script>${bridge(input.maxHeight ?? null)}</script>`,
  ].join("\n");
  // HTML のページ全体（<!doctype>・<html>・<head>）を書いてきたら、頭の印を外して中身だけを後ろに置く（ブラウザが head と body に振り分け直す）
  const body = input.kind === "svg" ? input.code : input.code.replace(/^\s*<!doctype[^>]*>/i, "");
  return `<!doctype html>\n<html><head>\n${head}\n</head><body>\n${body}\n</body></html>`;
}

/** 明るいテーマの値（HTML のメモに保存するとき・スマホの明るい配色。画面はいまのテーマの値を CSS から読んで渡す） */
export const VISUAL_LIGHT_THEME: VisualThemeValues = {
  "--vis-bg": "#ffffff",
  "--vis-surface": "#f6f8fa",
  "--vis-text": "#1f2328",
  "--vis-muted": "#656d76",
  "--vis-border": "#d0d7de",
  "--vis-accent": "#137752",
  "--vis-accent-text": "#ffffff",
  "--vis-danger": "#cf222e",
  "--vis-chart-1": "#1276c6",
  "--vis-chart-2": "#137752",
  "--vis-chart-3": "#b97515",
  "--vis-chart-4": "#b5427b",
  "--vis-chart-5": "#cf222e",
  "--vis-chart-6": "#4d7a2a",
  "--vis-font": "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif",
  "--vis-mono": "SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  "--vis-radius": "8px",
};

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * 図を HTML のメモにするときの中身（明るいテーマの値を置いたページ。HTML のメモの表示はスクリプトを動かさないので、
 * スクリプトで描くグラフは描かれない）
 */
export function visualMemoHtml(title: string, code: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${visualThemeCss(VISUAL_LIGHT_THEME)}
${BASE_STYLE}</style>
</head>
<body>
${code.replace(/^\s*<!doctype[^>]*>/i, "")}
</body>
</html>
`;
}

/** 枠のページ（/visual-frame。コアが VISUAL_FRAME_CSP の見出しで返す）。外から中身を受け取ったら、そのページに書き替える */
export const VISUAL_FRAME_SHELL = `<!doctype html><html><head><meta charset="utf-8"><script>
addEventListener("message", (e) => {
  if (e.source !== parent || !e.data || e.data.type !== ${JSON.stringify(VISUAL_MESSAGES.render)} || typeof e.data.html !== "string") return;
  document.open(); document.write(e.data.html); document.close();
});
parent.postMessage({ type: ${JSON.stringify(VISUAL_MESSAGES.ready)} }, "*");
</script></head><body></body></html>`;
