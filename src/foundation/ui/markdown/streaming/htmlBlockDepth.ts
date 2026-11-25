// ブロック分け（markdownBlocks.ts の splitBlocks・createBlockSplitter）で、HTML の入れ物の開きから閉じまでを 1 つのブロックにまとめるための数え方。
// Markdown の中の HTML は、同じ親の中で開きと閉じがそろったものだけを要素にする（html/htmlTree.ts）ので、
// <details>\n\n本文\n\n</details> の開きと閉じが別のブロックに分かれると、どちらも文字のまま出てしまう

/**
 * 段落をはさめる入れ物のうち、閉じを省けないもの（描く側が要素にするものと同じ小文字の名前だけ）。
 * 閉じを省ける li・td などは、閉じがなくても数がずれないよう数えない（外の ul・table が数える）
 */
const CONTAINER_TAG = /<(\/?)(div|blockquote|details|section|article|aside|header|footer|nav|main|address|center|figure|ul|ol|dl|table)(?=[\s/>])[^<>]*>/g;
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
