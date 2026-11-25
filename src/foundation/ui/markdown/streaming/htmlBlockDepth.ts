// ブロック分け（markdownBlocks.ts の splitBlocks・createBlockSplitter）で、HTML の入れ物の開きから閉じまでを 1 つのブロックにまとめるための数え方。
// Markdown の中の HTML は、同じ親の中で開きと閉じがそろったものだけを要素にする（html/htmlTree.ts）ので、
// <details>\n\n本文\n\n</details> の開きと閉じが別のブロックに分かれると、どちらも文字のまま出てしまう

/**
 * 段落をはさめる入れ物のうち、閉じを省けないもの（描く側が要素にするものと同じ小文字の名前だけ）。
 * 閉じを省ける li・td などは、閉じがなくても数がずれないよう数えない（外の ul・table が数える）
 */
const CONTAINER_TAG = /<(\/?)(div|blockquote|details|section|article|aside|header|footer|nav|main|address|center|figure|ul|ol|dl|table)(?=[\s/>])[^<>]*>/g;
/**
 * CommonMark の HTML ブロックの始まり（6 番: 決まった名前のタグで始まる行・7 番: 1 つのタグだけの行）。リストの印・引用の > の後ろと、
 * 字下げの深い行も見る（多めに見る。数えるのは HTML ブロックの中の行だけで、文の中の <div> は同じ親の中でしか要素にならないので数えない）
 */
const HTML_BLOCK_START = new RegExp(
  "^[ \\t]*(?:(?:>|[-+*]|\\d{1,9}[.)])[ \\t]*)*(?:<\\/?(?:" +
    "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|" +
    "frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|" +
    "table|tbody|td|tfoot|th|thead|title|tr|track|ul" +
    ")(?=[\\s/>]|$)|<\\/?[A-Za-z][A-Za-z0-9-]*(?:\\s[^<>]*)?\\/?>[ \\t]*$)",
  "i",
);

/** HTML の入れ物でまとめる大きさの上限（字数。開きから閉じが来ないまま超えたら、まとめるのをやめる） */
const MAX_HTML_GROUP_CHARS = 32_000;

/** 文の中のコード（` で囲んだ所。中のタグは文字のまま） */
const INLINE_CODE = /`[^`\n]*`/g;

/**
 * 1 行の中の入れ物の開きの数から閉じの数を引いたもの（自分で閉じる <div/> は描く側でも文字なので数えない）。
 * 多めに見ても、ブロックをまとめすぎるだけ（まとめても描いた結果は変わらない）
 */
export function htmlContainerDelta(line: string): number {
  if (!line.includes("<")) return 0;
  let delta = 0;
  for (const m of line.replace(INLINE_CODE, "").matchAll(CONTAINER_TAG)) {
    if (m[1]) delta--;
    else if (!m[0].endsWith("/>")) delta++;
  }
  return delta;
}

/** HTML の入れ物でまとめる様子（ブロック分けの様子の一部。写しやすいよう平らに持つ） */
export interface HtmlGroupState {
  /** 閉じていない HTML の入れ物の数 */
  htmlDepth: number;
  /** 入れ物を開いた行の頭（htmlDepth が 0 から増えた所） */
  htmlOpenedAt: number;
  /** いまの行が HTML ブロックの中（空行で終わる。空行で false にするのは呼ぶ側） */
  inHtmlBlock: boolean;
}

/**
 * 空でない 1 行（start は行の頭）の入れ物を数える。HTML ブロックの中の行だけを数え、閉じが来ないまま MAX_HTML_GROUP_CHARS を超えたら
 * 0 に戻す（書きかけの返答で、閉じない <div> の後ろを毎フレーム 1 つの大きなブロックとして描き直さないように。超えた先の閉じは文字で出る）
 */
export function countHtmlGroup(st: HtmlGroupState, line: string, start: number): void {
  if (!st.inHtmlBlock && HTML_BLOCK_START.test(line)) st.inHtmlBlock = true;
  if (st.inHtmlBlock) {
    const depth = Math.max(0, st.htmlDepth + htmlContainerDelta(line));
    if (st.htmlDepth === 0 && depth > 0) st.htmlOpenedAt = start;
    st.htmlDepth = depth;
  }
  if (st.htmlDepth > 0 && start + line.length - st.htmlOpenedAt > MAX_HTML_GROUP_CHARS) st.htmlDepth = 0;
}
