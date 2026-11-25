/**
 * 図のソースが、描く途中で外（インターネット・コアの URL）を読みに行く書き方を含むか。含む図は Mermaid に渡さず、ソースのまま出す。
 * Mermaid は描くときに図を文書に入れて測るので、描いた SVG を整える（sanitizeSvg.ts）より前に、画像・CSS を読みに行ってしまう。
 *
 * 外す（書き換えて描く）でなく描かない方にした理由: flowchart の画像の形は、img を外すと Mermaid が空の画像の読み込みを待って描けずに終わる。
 * ソースの書き換えは書き方の幅（引用符・複数行・図の種類ごとの書き方）を取りこぼしやすい。ふつうの図はこれらを書かないので、描かない方が図を壊さない。
 *
 * 同梱の Mermaid 12.2.0 のコードで確かめた、画像の URL を書ける所:
 * - flowchart の形の指定 @{ img: "…" }（new Image() で読み、<image href> を置く）
 * - sequenceDiagram の参加者の properties の "icon"（@ で始まらなければ <image xlink:href> を置く）
 * - style・classDef・%%{init}%% の themeCSS などの CSS の url(…)・@import
 * - HTML のラベルの <img> など（htmlLabels は mermaidConfig.ts で書き換えられないようにしてあるが、重ねて止める）
 * C4 の sprite・architecture と flowchart の icon・mindmap の ::icon は、登録した名前のアイコンか大きさだけで、URL を読まない。
 * kanban・click のリンクは読みに行かない（押したときだけ。sanitizeSvg.ts が外す）
 */

/** 形の指定（@{ … }） */
const SHAPE_DATA = /@\{[^}]*\}?/g;
/** 形の指定の中の img（data: の画像は外を読まないので通す） */
const SHAPE_IMAGE = /["']?\bimg["']?\s*:\s*["']?\s*(?!data:)[^\s"']/i;
/** sequenceDiagram の参加者の properties の行で、@ で始まらない icon */
const ACTOR_ICON = /^\s*properties\b.*["']?\bicon["']?\s*:\s*["']\s*(?!@)[^\s"']/im;
/** CSS で外を読む書き方（# と data: でない url(…)・@import・image-set） */
const CSS_FETCH = /url\(\s*["']?\s*(?!#|data:)[^\s"')]|@import|image-set\(/i;
/** HTML で外を読む要素 */
const HTML_FETCH = /<\s*(?:img|image|picture|source|video|audio|iframe|object|embed|link|svg)\b/i;

/** 描く途中で外を読みに行く書き方を含むか */
export function mermaidReadsOutside(code: string): boolean {
  if (CSS_FETCH.test(code) || HTML_FETCH.test(code) || ACTOR_ICON.test(code)) return true;
  for (const shape of code.matchAll(SHAPE_DATA)) if (SHAPE_IMAGE.test(shape[0])) return true;
  return false;
}
