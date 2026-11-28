// ノートの編集の画面の読み取り（@lezer/markdown）に足す、表の見つけ方の直し。
// 元の決まりは、| で始まる段落の 2 行目が区切りの行でなければ、その段落の中ではもう表を探さない。
// 返答の表示（micromark）は、段落の途中でも「| を含む行の次が区切りの行（セルの数が同じ）」ならそこから表にするので、同じ所で段落を終える
import type { MarkdownConfig } from "@lezer/markdown";
import { pipeIndexes } from "./tableBlocks";

/** 区切りの行（元の決まりと同じ形。行の頭の > と空白も許す） */
const DELIMITER_LINE = /^[>\s]*\|?(\s*:?-+:?\s*\|)+(\s*:?-+:?\s*)?$/;

/** 行のセルの数（元の決まりの数え方と同じ: 頭と終わりの | は数えず、\ で消した | は区切りにしない） */
function countTableCells(text: string, start = 0): number {
  let count = 0;
  let first = true;
  let inCell = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 124 && !esc) {
      if (!first || inCell) count++;
      first = false;
      inCell = false;
    } else if (esc || (c !== 32 && c !== 9)) {
      inCell = true;
    }
    esc = !esc && c === 92;
  }
  return inCell ? count + 1 : count;
}

/** 段落につく表の読み取りの様子（元の決まりの中のもの。rows が null は 2 行目の前、false は表でない、配列は表の途中） */
interface TableLeafState {
  rows: unknown;
}

/**
 * | を含む行の次が区切りの行（セルの数が同じ）なら、その手前で段落を終える（その行から表になる）。
 * 元の決まりが段落を終えない場合（| で始まる段落の中）だけに効かせる。表の途中（rows が配列）では終えない
 */
export const tableAfterPipeLines: MarkdownConfig = {
  parseBlock: [
    {
      name: "TableAfterPipeLines",
      endLeaf(cx, line, leaf) {
        // 元の表の読み取りだけが rows を持つ（クラスは公開されていないので形で見分ける）
        const table = leaf.parsers.find((p): p is typeof p & TableLeafState => "rows" in p);
        if (!table || Array.isArray(table.rows) || !pipeIndexes(line.text, line.basePos).length) return false;
        // 2 行目が区切りの行なら、1 行目を見出しにした表になる（元の決まりに任せる）
        if (table.rows === null && DELIMITER_LINE.test(line.text.slice(line.basePos))) return false;
        const next = cx.peekLine();
        return DELIMITER_LINE.test(next) && countTableCells(line.text, line.basePos) === countTableCells(next, line.basePos);
      },
      before: "Table",
    },
  ],
};
