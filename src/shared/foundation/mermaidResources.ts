/**
 * 図のソースが、描く途中で外（インターネット・コアの URL）を読みに行く書き方を含むか。含む図は Mermaid に渡さず、ソースのまま出す。
 * パソコンとスマホで同じ判定（スマホは描く前に、パソコンは閉じた枠に渡す前に見る）。
 * 守りの本体は描く場所（パソコンは mermaidFrame.ts の枠、スマホは WebView のページ。外へ読み込み・通信ができない CSP）で、これは重ねの守り
 * （枠の CSP に穴があっても読みに行かせない。ふつうの図が書かないものだけを断り、ラベルの \・前書き・HTML のタグの名前などは枠に任せて描く）。
 *
 * 同梱の Mermaid 12.2.0 のコードで確かめた、画像の URL を書ける所:
 * - flowchart の形の指定 @{ img: "…" }（new Image() で読み、<image href> を置く）
 * - sequenceDiagram の参加者の properties の "icon"（@ で始まらなければ <image xlink:href> を置く）
 * - style・classDef・linkStyle の CSS と、前書き・%%{init}%% の設定のうち CSS の値に入るもの（url(…)・@import・image-set・@font-face。
 *   \75 rl( のような CSS のエスケープ・コメントで隠したものも。配色・CSS・字体の設定は下の MERMAID_SECURE_KEYS で書き換えられない）
 * HTML のラベル（<img> など）は htmlLabels を書き換えられない（MERMAID_SECURE_KEYS）ので文字になる。
 * C4 の sprite・architecture と flowchart の icon・mindmap の ::icon は、登録した名前のアイコンか大きさだけで、URL を読まない。
 * kanban・click のリンクは読みに行かない（押したときだけ。mermaidSvg.ts が外す）
 */
import { decodeCss } from "./mermaidSvg";

/**
 * Mermaid の版（パソコンは package.json の mermaid、スマホは CDN から読む版）。上の書き方の判定と下の MERMAID_SECURE_KEYS はこの版のコードで確かめたので、
 * 版を上げるときは両方を確かめ直す
 */
export const MERMAID_VERSION = "12.2.0";

/**
 * 図の中の %%{init}%%・前書き（---）の config で書き換えられない設定（Mermaid の secure に渡す）。Mermaid は入れ子の同じ名前（flowchart.htmlLabels など）も消す
 * （どちらの書き方も Mermaid の addDirective を通り、ここにある名前を消してから設定に重ねる）。
 * Mermaid の既定の 6 つに、HTML のラベル（<img> などで外を読む・foreignObject）・ラベルの無害化の設定（タグを足せる）と、
 * 配色・CSS・字体の設定（themeCSS は図の CSS にそのまま入り、ほかも CSS の値に入るので、書いた人に CSS を書かせない）を足す
 */
export const MERMAID_SECURE_KEYS = [
  "secure",
  "securityLevel",
  "startOnLoad",
  "maxTextSize",
  "suppressErrorRendering",
  "maxEdges",
  "htmlLabels",
  "dompurifyConfig",
  "theme",
  "themeVariables",
  "themeCSS",
  "darkMode",
  "fontFamily",
  "altFontFamily",
  "fontSize",
  "arrowMarkerAbsolute",
];

/** 形の指定（@{ … }） */
const SHAPE_DATA = /@\{[^}]*\}?/g;
/** 形の指定の中の img（data: の画像は外を読まないので通す） */
const SHAPE_IMAGE = /["']?\bimg["']?\s*:\s*["']?\s*(?!data:)[^\s"']/i;
/** sequenceDiagram の参加者の properties の行で、@ で始まらない icon */
const ACTOR_ICON = /^\s*properties\b.*["']?\bicon["']?\s*:\s*["']\s*(?!@)[^\s"']/im;
/** CSS で外を読む書き方（# と data: でない url(…)・@import・image-set・@font-face の src） */
const CSS_FETCH = /url\(\s*["']?\s*(?!#|data:)[^\s"')]|@import|image-set\(|@font-face/i;

/** 描く途中で外を読みに行く書き方を含むか */
export function mermaidReadsOutside(code: string): boolean {
  // Mermaid と同じく CR を改行にそろえてから見る（CRLF・CR だけの改行で行の判定をすり抜けないように）
  const src = code.replace(/\r\n?/g, "\n");
  if (CSS_FETCH.test(src) || CSS_FETCH.test(decodeCss(src)) || ACTOR_ICON.test(src)) return true;
  for (const shape of src.matchAll(SHAPE_DATA)) if (SHAPE_IMAGE.test(shape[0])) return true;
  return false;
}
