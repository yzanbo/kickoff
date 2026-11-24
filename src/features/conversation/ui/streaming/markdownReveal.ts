import { mayContainMath } from "@shared/foundation/markdown/mathGuard";
import { createBlockScanner, type BlockScanner, type BlockTail } from "@/foundation/ui/markdown/streaming/markdownBlocks";
import type { RevealLimit } from "@/foundation/ui/markdown/streaming/streamReveal";
import { MAX_BLOCK_HOLD, scanInline } from "./markdownRevealInline";

/**
 * 書きかけの返答を少しずつ出すとき、書きかけの記号を生の文字で出さないための決まり。
 * - 補うもの（止めない）: 強調・取り消し線（* _ ~）とコードスパン（`）。開いたままのものに閉じの記号を足して描く（文字は増えないので、薄く出す段の数え方もずれない）
 * - 止めるもの（書きかけの手前まで出す）: リンクの行き先（文字だけ先に出す）・画像・自動リンク・表（区切りの行が来るまで・行は 1 行ずつ）・
 *   setext の下線・行の頭の印だけの行・コードブロックの開きの行（言語名）と閉じの書きかけ・数式・文字参照・文の終わりの \ と記号の並び
 * CommonMark の近似で、外れても「一瞬生の記号が出る」「少し出るのが遅れる」だけ（確定した返答の描き方は変えない）
 */

/** 止める決まりで見る長さ（最後のブロックの最後の分だけ。長いブロックでも毎フレームの手間を一定にする） */
export const MAX_SCAN = 4000;

/** 少しずつ出すときに描く文: length まで出し（omit の位置の文字は外す）、後ろに closers を補う */
export interface RevealCut {
  /** 出してよい長さ（shown 以下） */
  length: number;
  /** 後ろに補う閉じの記号（描くときだけ足す） */
  closers: string;
  /** length より前で描かずに外す位置（書きかけのリンクの [。文字だけを先に出す。小さい順） */
  omit: number[];
}

/** 描く文（text の length までから omit の文字を外し、closers を足す） */
export function cutText(text: string, cut: RevealCut): string {
  let out = "";
  let from = 0;
  for (const at of cut.omit) {
    out += text.slice(from, at);
    from = at + 1;
  }
  return out + text.slice(from, cut.length) + cut.closers;
}

/** 書きかけの返答 1 つごとの、出す文の決まり（`useStreamReveal` に渡す。ブロックの読み取りを中に持ち、続きの文なら増えた行だけ読む） */
export function createMarkdownRevealLimit(): RevealLimit {
  const scanner = createBlockScanner();
  return (text, shown) => {
    const cut = revealCut(text, shown, scanner);
    return { length: cut.length, render: cutText(text, cut) };
  };
}

/** 行の頭の印だけ（後ろに文字がまだない）の行: 見出し・箇条書き・番号（数字だけの行も）・引用 */
const MARKER_ONLY = /^[ \t]*(#{1,6}|[-*+]|\d{1,9}[.)]?|>)[ \t]*$/;
/** setext の下線になりうる行 */
const SETEXT_ONLY = /^ {0,3}(=+|-+)[ \t]*$/;
/** 段落でない行の頭（見出し・引用・箇条書き・表・コードブロック） */
const NOT_PARAGRAPH = /^[ \t]*(#{1,6}([ \t]|$)|>|[-*+][ \t]|\d{1,9}[.)][ \t]|\||`{3,}|~{3,})/;
/** 表の見出しの行（| で始まるものだけ。| で始まらない見出しの表は、いまと同じく段落から表に変わる） */
const TABLE_HEADER = /^ {0,3}\|/;
/** 新しい入れ物（見出し・引用・箇条書き・表の行）が始まる行。強調はこれをまたがない */
const CONTAINER_START = /^[ \t]*(#{1,6}[ \t]|>|[-*+][ \t]|\d{1,9}[.)][ \t]|\|)/;
const HEADING = /^[ \t]*#{1,6}[ \t]/;
/** 字下げのコード（4 字以上の字下げ） */
const INDENTED_CODE = /^( {4}|\t)/;

/** pos を含む行の頭 */
const lineStartOf = (text: string, pos: number) => text.lastIndexOf("\n", pos - 1) + 1;

/**
 * 少しずつ出している Markdown の文で、shown 文字目まで出したいときに描く文。
 * 決まりは最後のブロック（scan が覚えている。続きの文なら増えた行だけ読む）の、最後の MAX_SCAN 文字だけを見る（前のブロックは書き終えているので止めない）
 */
export function revealCut(text: string, shown: number, scan: BlockScanner): RevealCut {
  const tail = scan.scan(text, shown);
  let length = blockHold(text, shown, tail);
  if (tail.fence || tail.mathStart !== null) return finish(text, length, "", []);
  let closers = "";
  let omit: number[] = [];
  // 字下げのコードの中は文の書式がない
  const blockEnd = text.indexOf("\n", tail.blockStart);
  const blockLine = text.slice(tail.blockStart, blockEnd < 0 || blockEnd > shown ? shown : blockEnd);
  if (!INDENTED_CODE.test(blockLine)) {
    const region = inlineRegion(text, tail, length, shown);
    if (region) {
      for (let round = 0; round < 8; round++) {
        const r = scanInline(text, region.start, length, shown, mayContainMath(text.slice(region.start, shown)));
        if (r.hold < length) {
          length = r.hold;
          continue;
        }
        // 表の行の中は、閉じの記号を補うと行の終わりの | の後ろに付いてしまうので補わない
        closers = region.tableRow ? "" : r.closers;
        omit = r.omit;
        break;
      }
    }
  }
  if (closers) {
    // 補った記号の直前が空白・改行だと閉じとして読まれないので、空白の手前で止める
    while (length > 0 && /\s/.test(text[length - 1])) length--;
  }
  return finish(text, length, closers, omit);
}

function finish(text: string, length: number, closers: string, omit: number[]): RevealCut {
  // 絵文字などの 2 つで 1 文字のものは、片方だけを出さない
  const code = text.charCodeAt(length - 1);
  if (length > 0 && code >= 0xd800 && code <= 0xdbff) length -= 1;
  return { length, closers, omit: omit.filter((at) => at < length) };
}

/** 行ごとの止める位置（コードブロック・数式ブロック・最後の行の印・setext・表）。止めなければ shown */
function blockHold(text: string, shown: number, tail: BlockTail): number {
  const ls = lineStartOf(text, shown);
  const line = text.slice(ls, shown);
  if (tail.fence) {
    const fence = tail.fence;
    // 言語名が決まるまで、コードブロックを出さない（```mermaid の書きかけをふつうのコードとして出さない）
    if (!fence.infoDone) return fence.start;
    // 閉じの印の書きかけ（開きより短い同じ印だけの行）は、その行の頭で止める
    const mark = line.trim();
    if (ls > fence.start && mark && mark.length < fence.length && [...mark].every((c) => c === fence.char)) return ls;
    return shown;
  }
  if (tail.mathStart !== null) {
    // 閉じの $$ の行（改行がまだ）まで来たら、閉じたものとして出す
    if (ls > tail.mathStart && line.trim() === "$$") return shown;
    return shown - tail.mathStart > MAX_BLOCK_HOLD ? shown : tail.mathStart;
  }
  let hold = shown;
  if (line.trim() !== "") {
    if (MARKER_ONLY.test(line)) hold = ls;
    else if (SETEXT_ONLY.test(line) && ls > tail.blockStart) {
      const prev = text.slice(lineStartOf(text, ls - 1), ls - 1);
      if (prev.trim() !== "" && !NOT_PARAGRAPH.test(prev)) hold = ls;
    }
  }
  const table = tableHold(text, Math.max(tail.blockStart, tail.closedAt, scanStart(text, shown)), shown);
  return table === null ? hold : Math.min(hold, table);
}

/** 見る範囲の頭（最後の MAX_SCAN 文字。行の途中なら次の行の頭） */
function scanStart(text: string, shown: number): number {
  if (shown <= MAX_SCAN) return 0;
  const nl = text.indexOf("\n", shown - MAX_SCAN);
  return nl < 0 || nl >= shown ? shown : nl + 1;
}

/** 区切りの行になりうる書きかけ */
const DELIMITER_PREFIX = /^[ \t]*[|:\- \t]*$/;
const isDelimiterRow = (line: string) => DELIMITER_PREFIX.test(line) && line.includes("-") && line.includes("|");

/**
 * 表の止める位置: 見出しの行（| で始まる）は、区切りの行が改行まで来るまでその行の頭で止める（見出しを段落として出さない）。
 * 表と決まったら、改行がまだの最後の行（行）をその行の頭で止める（行は 1 行ずつまとめて出す）。止める長さが MAX_BLOCK_HOLD を超えたら止めない
 */
function tableHold(text: string, from: number, shown: number): number | null {
  const lines = text.slice(from, shown).split("\n");
  const last = lines.length - 1;
  const hold = (at: number) => (shown - at > MAX_BLOCK_HOLD ? null : at);
  let start = from;
  let inTable = false;
  for (let i = 0; i <= last; i++) {
    const line = lines[i];
    const lineStart = start;
    start += line.length + 1;
    if (inTable) {
      if (i === last && line !== "") return hold(lineStart);
      continue;
    }
    if (!TABLE_HEADER.test(line)) continue;
    // 見出しの行の改行がまだ・見出しの行で終わっている
    if (i === last || (i + 1 === last && lines[last] === "")) return hold(lineStart);
    const next = lines[i + 1];
    if (i + 1 === last) {
      // 区切りの行の書きかけ: 区切りの行になりうる間は見出しの頭で止める
      if (DELIMITER_PREFIX.test(next)) return hold(lineStart);
      continue;
    }
    if (isDelimiterRow(next)) {
      inTable = true;
      start += next.length + 1;
      i++;
    }
  }
  return null;
}

/**
 * 文の中の書式を読む範囲: 最後のブロックの、最後の入れ物（見出し・引用・箇条書き・表の行）の行から。
 * 見出しは 1 行で終わるので、見出しの次の行があればそこから。閉じたコードブロックの後ろから
 */
function inlineRegion(text: string, tail: BlockTail, length: number, shown: number): { start: number; tableRow: boolean } | null {
  let start = Math.max(tail.blockStart, tail.closedAt, scanStart(text, shown));
  if (start >= length) return null;
  let tableRow = false;
  let ls = start;
  while (ls < length) {
    const nl = text.indexOf("\n", ls);
    const end = nl < 0 || nl >= length ? length : nl;
    const line = text.slice(ls, end);
    if (CONTAINER_START.test(line)) {
      start = HEADING.test(line) && end < length ? end + 1 : ls;
      tableRow = start === ls && TABLE_HEADER.test(line);
    }
    if (end >= length) break;
    ls = end + 1;
  }
  return start < length ? { start, tableRow } : null;
}
