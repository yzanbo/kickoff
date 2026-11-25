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
 * - style・classDef・%%{init}%% の themeCSS などの CSS の url(…)・@import・image-set・@font-face（\75 rl( のようなエスケープ・コメントで隠したものも）
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
/** CSS で外を読む書き方（# と data: でない url(…)・@import・image-set・@font-face の src） */
const CSS_FETCH = /url\(\s*["']?\s*(?!#|data:)[^\s"')]|@import|image-set\(|@font-face/i;
/** CSS を書ける所（%%{init}%% の設定・頭の --- の設定（themeCSS など）・style・classDef・linkStyle の行） */
const CSS_REGIONS = /%%\{[\s\S]*?\}%%|^---\n[\s\S]*?\n---|^[ \t]*(?:style|classDef|linkStyle)\b.*$/gm;

/** CSS のエスケープ（\75 rl( = url( など）を戻し、コメントを消した形（書き換えて隠した書き方も、戻してから判定・除去する） */
export function decodeCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\\([0-9a-fA-F]{1,6})[ \t\n\f]?|\\([^\n0-9a-fA-F])/g, (_m, hex: string | undefined, ch: string | undefined) => {
    if (ch !== undefined) return ch;
    const code = Number.parseInt(hex ?? "", 16);
    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? "\ufffd" : String.fromCodePoint(code);
  });
}
/** HTML で外を読む要素 */
const HTML_FETCH = /<\s*(?:img|image|picture|source|video|audio|iframe|object|embed|link|svg)\b/i;

/** 描く途中で外を読みに行く書き方を含むか */
export function mermaidReadsOutside(code: string): boolean {
  if (CSS_FETCH.test(code) || CSS_FETCH.test(decodeCss(code)) || HTML_FETCH.test(code) || ACTOR_ICON.test(code)) return true;
  // CSS を書ける所の \ は、戻し方の幅（エスケープ・JSON の \u など）を取りこぼさないよう、それだけで描かない（ふつうの図は書かない）
  for (const region of code.matchAll(CSS_REGIONS)) if (region[0].includes("\\")) return true;
  for (const shape of code.matchAll(SHAPE_DATA)) if (SHAPE_IMAGE.test(shape[0])) return true;
  return false;
}
