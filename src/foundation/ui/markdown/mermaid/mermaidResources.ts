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
 * - style・classDef・linkStyle の CSS と、前書き・%%{init}%% の設定のうち CSS の値に入るもの（url(…)・@import・image-set・@font-face。
 *   \75 rl( のようなエスケープ・コメントで隠したものも。配色・CSS・字体の設定は mermaidConfig.ts の MERMAID_SECURE_KEYS で書き換えられない）
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
/** 前書き（---）がありうる形（Mermaid の matchFrontMatter は 1 行目の字下げ・--- の後ろの空白を許す。広めに、頭の空行も含める） */
const FRONT_MATTER = /^\s*---/;
/** CSS を書ける文（style・classDef・linkStyle・C4 の Update…Style）の、名前から行の終わりまでに \ があるか（; で続けた文も、行の途中から見る） */
const CSS_STATEMENT_ESCAPE = /\b(?:style|classDef|linkStyle|Update\w*Style)\b[^\n]*\\/;

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
  // Mermaid と同じく CR を改行にそろえてから見る（CRLF・CR だけの改行で行の判定をすり抜けないように）
  const src = code.replace(/\r\n?/g, "\n");
  if (CSS_FETCH.test(src) || CSS_FETCH.test(decodeCss(src)) || HTML_FETCH.test(src) || ACTOR_ICON.test(src)) return true;
  // 設定を書ける図（前書き・%%{…}%%）と CSS を書ける文の \ は、戻し方の幅（CSS のエスケープ・YAML の \x75・JSON の \u など）を取りこぼさないよう、
  // それだけで描かない（ふつうの図は書かない）。設定の区域を切り出さずにソース全体で見る（字下げ・閉じのない %%{ で区域の判定をすり抜けないように）
  if (src.includes("\\") && (FRONT_MATTER.test(src) || src.includes("%%{") || CSS_STATEMENT_ESCAPE.test(src))) return true;
  for (const shape of src.matchAll(SHAPE_DATA)) if (SHAPE_IMAGE.test(shape[0])) return true;
  return false;
}
