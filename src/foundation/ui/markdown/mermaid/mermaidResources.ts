/**
 * 図のソースが、描く途中で外（インターネット・コアの URL）を読みに行く書き方を含むか。含む図は Mermaid に渡さず、ソースのまま出す。
 * 守りの本体は描く枠（mermaidFrame.ts。外へ読み込み・通信ができない CSP で、画面の DOM を持たない）で、これは重ねの守り
 * （枠の CSP に穴があっても読みに行かせない。ふつうの図が書かないものだけを断り、ラベルの \・前書き・HTML のタグの名前などは枠に任せて描く）。
 *
 * 同梱の Mermaid 12.2.0 のコードで確かめた、画像の URL を書ける所:
 * - flowchart の形の指定 @{ img: "…" }（new Image() で読み、<image href> を置く）
 * - sequenceDiagram の参加者の properties の "icon"（@ で始まらなければ <image xlink:href> を置く）
 * - style・classDef・linkStyle の CSS と、前書き・%%{init}%% の設定のうち CSS の値に入るもの（url(…)・@import・image-set・@font-face。
 *   \75 rl( のような CSS のエスケープ・コメントで隠したものも。配色・CSS・字体の設定は mermaidConfig.ts の MERMAID_SECURE_KEYS で書き換えられない）
 * HTML のラベル（<img> など）は htmlLabels を mermaidConfig.ts で書き換えられないので文字になる。
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

/** CSS のエスケープ（\75 rl( = url( など）を戻し、コメントを消した形（書き換えて隠した書き方も、戻してから判定・除去する） */
export function decodeCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\\([0-9a-fA-F]{1,6})[ \t\n\f]?|\\([^\n0-9a-fA-F])/g, (_m, hex: string | undefined, ch: string | undefined) => {
    if (ch !== undefined) return ch;
    const code = Number.parseInt(hex ?? "", 16);
    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? "\ufffd" : String.fromCodePoint(code);
  });
}

/** 描く途中で外を読みに行く書き方を含むか */
export function mermaidReadsOutside(code: string): boolean {
  // Mermaid と同じく CR を改行にそろえてから見る（CRLF・CR だけの改行で行の判定をすり抜けないように）
  const src = code.replace(/\r\n?/g, "\n");
  if (CSS_FETCH.test(src) || CSS_FETCH.test(decodeCss(src)) || ACTOR_ICON.test(src)) return true;
  for (const shape of src.matchAll(SHAPE_DATA)) if (SHAPE_IMAGE.test(shape[0])) return true;
  return false;
}
