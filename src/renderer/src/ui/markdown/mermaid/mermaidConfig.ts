import type { MermaidConfig } from "mermaid";
import type { AppliedTheme } from "@/app/theme";

/** 図に使える文字数・線の数の上限（超えたら図にせず、コードのまま出す） */
const MAX_TEXT_SIZE = 20_000;
const MAX_EDGES = 400;

/** 色分けに使う色（tokens.css の --sec-* の色から。円グラフ・マインドマップ・タイムラインなど） */
const PALETTE_VARS = [
  "--sec-requirements",
  "--sec-implementation",
  "--sec-testing",
  "--sec-schedule",
  "--sec-deployment",
  "--info",
  "--warn",
  "--ok",
  "--ng",
  "--accent-bright",
  "--dot-needs-input",
  "--muted",
];

function parseHex(color: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 2 つの色（#rgb・#rrggbb）を混ぜる。weight は a の割合（読めない色なら a のまま） */
export function mixColor(a: string, b: string, weight: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  return `#${pa.map((v, i) => Math.round(v * weight + pb[i] * (1 - weight)).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 図を描く設定。Mermaid の素の配色（base）に、アプリの色（CSS の変数）を当ててなじませる。
 * 文字は HTML ではなく SVG で描き（htmlLabels: false）、図の中のリンクやスクリプトは動かさない（securityLevel: strict）
 */
export function mermaidConfig(theme: AppliedTheme): MermaidConfig {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  const dark = theme === "dark";
  const text = v("--text");
  // 図の地は、コードの欄と同じ色
  const bg = v("--bg-sidebar");
  // 図形の塗り（ライトでは地と同じ色になるので、白にする）
  const node = dark ? v("--bg-hover") : v("--bg");
  const border = mixColor(text, node, 0.3);
  const line = v("--muted");
  const tint = mixColor(v("--accent-bright"), bg, 0.2);
  const palette = PALETTE_VARS.map(v);
  // 文字を重ねる面は、地に寄せた淡い色にする
  const soft = (color: string) => mixColor(color, bg, dark ? 0.4 : 0.3);
  const indexed = (prefix: string, colors: string[], start = 0) =>
    Object.fromEntries(colors.map((color, i) => [`${prefix}${i + start}`, color]));

  return {
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    htmlLabels: false,
    maxTextSize: MAX_TEXT_SIZE,
    maxEdges: MAX_EDGES,
    theme: "base",
    // Mermaid 12 の既定（neo）は影と立体の枠が付き、ダークでは浮くので、平らな見た目にする
    look: "classic",
    fontFamily: getComputedStyle(document.body).fontFamily,
    themeVariables: {
      darkMode: dark,
      fontSize: "14px",
      background: bg,
      textColor: text,
      titleColor: text,
      lineColor: line,
      primaryColor: node,
      primaryTextColor: text,
      primaryBorderColor: border,
      secondaryColor: tint,
      secondaryTextColor: text,
      secondaryBorderColor: border,
      tertiaryColor: v("--bg-elev"),
      tertiaryTextColor: text,
      tertiaryBorderColor: border,
      clusterBkg: mixColor(text, bg, 0.04),
      clusterBorder: border,
      edgeLabelBackground: bg,
      noteBkgColor: v("--bg-active"),
      noteTextColor: text,
      noteBorderColor: border,
      actorBkg: node,
      actorBorder: border,
      actorTextColor: text,
      actorLineColor: line,
      signalColor: text,
      signalTextColor: text,
      labelBoxBkgColor: node,
      labelBoxBorderColor: border,
      labelTextColor: text,
      loopTextColor: text,
      activationBkgColor: tint,
      activationBorderColor: border,
      sequenceNumberColor: bg,
      pieTitleTextColor: text,
      pieSectionTextColor: text,
      pieLegendTextColor: text,
      pieStrokeColor: bg,
      pieOuterStrokeColor: border,
      ...indexed("pie", palette.map(soft), 1),
      ...indexed("cScale", palette.map(soft)),
      ...indexed("cScaleLabel", palette.map(() => text)),
      ...indexed("git", palette.slice(0, 8)),
      ...indexed("gitBranchLabel", palette.slice(0, 8).map(() => "#ffffff")),
    },
  };
}
