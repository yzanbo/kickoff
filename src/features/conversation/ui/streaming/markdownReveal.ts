import { mayBecomeSingleDollarMath, mayContainMath } from "@shared/foundation/markdown/mathGuard";
import { createBlockScanner, type BlockScanner, type BlockTail } from "@/foundation/ui/markdown/streaming/markdownBlocks";
import type { RevealLimit } from "@/foundation/ui/markdown/streaming/streamReveal";

/**
 * 書きかけの返答を少しずつ出すとき、書きかけの記号を生の文字で出さないための決まり。
 * - 補うもの（止めない）: 強調・取り消し線（* _ ~）とコードスパン（`）。開いたままのものに閉じの記号を足して描く（文字は増えないので、薄く出す段の数え方もずれない）
 * - 止めるもの（書きかけの手前まで出す）: リンクの行き先（文字だけ先に出す）・画像・自動リンク・表（区切りの行が来るまで・行は 1 行ずつ）・
 *   setext の下線・行の頭の印だけの行・コードブロックの開きの行（言語名）と閉じの書きかけ・数式・文字参照・文の終わりの \ と記号の並び
 * CommonMark の近似で、外れても「一瞬生の記号が出る」「少し出るのが遅れる」だけ（確定した返答の描き方は変えない）
 */

/** 文の中の書きかけで止める長さの上限（閉じない [ などを書いた文で、止まり続けないように。およそ 2 行） */
export const MAX_INLINE_HOLD = 120;
/** 表の見出し・表の行・数式ブロックで止める長さの上限 */
export const MAX_BLOCK_HOLD = 2000;
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
/** 文の終わりの、閉じの > がまだの自動リンク */
const AUTOLINK_TAIL = /^<[A-Za-z][A-Za-z0-9+.-]*(:[^\s<>]*)?$/;
/** 文の終わりの、; がまだの文字参照 */
const ENTITY_TAIL = /^&[A-Za-z0-9#]{0,31}$/;

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isPunct = (ch: string | undefined) => ch !== undefined && /[\p{P}\p{S}]/u.test(ch);

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

/** pos から続く同じ文字の数（end まで） */
function runLength(text: string, pos: number, end: number, ch: string): number {
  let n = 0;
  while (pos + n < end && text[pos + n] === ch) n++;
  return n;
}

/** from から end までで、ちょうど n 個のバッククォートの並びの位置（なければ -1） */
function findBacktickRun(text: string, from: number, end: number, n: number): number {
  let i = from;
  while (i < end) {
    if (text[i] !== "`") {
      i++;
      continue;
    }
    const run = runLength(text, i, end, "`");
    if (run === n) return i;
    i += run;
  }
  return -1;
}

/** リンクの行き先の閉じの ) の位置（かっこの数を数える。なければ -1） */
function findParenClose(text: string, from: number, end: number): number {
  let depth = 0;
  for (let i = from; i < end; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === "(") depth++;
    else if (c === ")") {
      if (depth === 0) return i;
      depth--;
    } else if (c === "\n" && text[i + 1] === "\n") return -1;
  }
  return -1;
}

interface Opener {
  char: string;
  count: number;
}

interface Bracket {
  at: number;
  image: boolean;
  footnote: boolean;
}

/**
 * from から end までの文の中の書式を読み、いちばん手前の止める位置（hold。止めなければ end）と、end で切ったときに補う閉じの記号・外す [ を返す。
 * shown は出したい長さ（止める長さの上限を数える）
 */
function scanInline(text: string, from: number, end: number, shown: number, math: boolean): { hold: number; closers: string; omit: number[] } {
  const stack: Opener[] = [];
  const brackets: Bracket[] = [];
  let hold = end;
  let code: number | null = null;
  // 止める（止める長さが上限を超えていれば止めずに false）
  const stop = (at: number, limit = Infinity) => {
    if (shown - at > limit) return false;
    hold = Math.min(hold, at);
    return true;
  };
  // 書きかけのリンク: 画像・脚注は [ の手前で、ほかは ] の手前で止め、[ を外して文字だけを出す
  const stopLink = (open: Bracket, close: number) => {
    if (shown - open.at > MAX_INLINE_HOLD) return false;
    return open.image || open.footnote ? stop(open.at) : stop(close);
  };
  let i = from;
  while (i < end) {
    const c = text[i];
    if (c === "\\") {
      const next = text[i + 1];
      if (i + 1 >= end) {
        stop(i);
        break;
      }
      if (math && (next === "(" || next === "[")) {
        const close = text.indexOf(next === "(" ? "\\)" : "\\]", i + 2);
        if (close < 0 || close + 2 > end) {
          if (stop(i, next === "(" ? MAX_INLINE_HOLD : MAX_BLOCK_HOLD)) break;
        } else {
          i = close + 2;
          continue;
        }
      }
      i += 2;
      continue;
    }
    if (c === "`") {
      const n = runLength(text, i, end, "`");
      // 文の終わりの印の並びは、開きか閉じか決まらないので手前で止める
      if (i + n >= end) {
        stop(i);
        break;
      }
      const close = findBacktickRun(text, i + n, end, n);
      if (close < 0) {
        // 閉じがまだのコードスパン: ここから後ろはコードの中
        code = n;
        break;
      }
      i = close + n;
      continue;
    }
    if (c === "*" || c === "_" || c === "~") {
      const n = runLength(text, i, end, c);
      if (i + n >= end) {
        stop(i);
        break;
      }
      delimiter(stack, c, n, i > from ? text[i - 1] : undefined, text[i + n]);
      i += n;
      continue;
    }
    if (c === "!" && text[i + 1] === "[") {
      brackets.push({ at: i, image: true, footnote: false });
      i += 2;
      continue;
    }
    if (c === "[") {
      brackets.push({ at: i, image: false, footnote: text[i + 1] === "^" });
      i++;
      continue;
    }
    if (c === "]") {
      const open = brackets.pop();
      if (open) {
        const next = text[i + 1];
        if (i + 1 >= end) {
          if (stopLink(open, i)) break;
        } else if (next === "(" || next === "[") {
          const close = next === "(" ? findParenClose(text, i + 2, end) : text.indexOf("]", i + 2);
          if (close < 0 || close >= end) {
            if (stopLink(open, i)) break;
          } else {
            i = close + 1;
            continue;
          }
        }
      }
      i++;
      continue;
    }
    if (c === "<") {
      if (i + 1 >= end || AUTOLINK_TAIL.test(text.slice(i, end))) {
        if (stop(i, MAX_INLINE_HOLD)) break;
      }
    } else if (c === "&") {
      if (ENTITY_TAIL.test(text.slice(i, end))) {
        stop(i);
        break;
      }
    } else if (c === "$" && math) {
      const n = runLength(text, i, end, "$");
      if (i + n >= end) {
        stop(i);
        break;
      }
      if (n >= 2) {
        const close = text.indexOf("$$", i + n);
        if (close < 0 || close + 2 > end) {
          if (stop(i, MAX_BLOCK_HOLD)) break;
          i += n;
          continue;
        }
        i = close + 2;
        continue;
      }
      const close = text.indexOf("$", i + 1);
      if (close >= 0 && close < end) {
        i = close + 1;
        continue;
      }
      // 閉じの $ がまだ: 数式になりうる開き（前が英数字でなく、後ろが空白でない）で、中身がまだ数式になりうる間だけ止める
      const before = i > from ? text[i - 1] : undefined;
      if (!(before !== undefined && /[A-Za-z0-9_]/.test(before)) && mayBecomeSingleDollarMath(text.slice(i + 1, end))) {
        if (stop(i)) break;
      }
    }
    i++;
  }
  // 閉じがまだの [ は外して中の文字を先に出す（画像・脚注は出さずに止める）
  const omit: number[] = [];
  for (const open of brackets) {
    if (shown - open.at > MAX_INLINE_HOLD) continue;
    if (open.image || open.footnote) stop(open.at);
    else omit.push(open.at);
  }
  // 補う記号は、開いた順の逆（いちばん内側から）
  let closers = code === null ? "" : "`".repeat(code);
  for (let k = stack.length - 1; k >= 0; k--) closers += stack[k].char.repeat(stack[k].count);
  return { hold, closers, omit };
}

/**
 * 強調・取り消し線の印の並び（CommonMark の左右の flanking の決まりの近似。3 の倍数の決まりは見ない）。
 * 閉じられるなら、同じ文字のいちばん近い開きを閉じ（間の開きは文字のまま）、残りが開けるなら積む
 */
function delimiter(stack: Opener[], char: string, count: number, before: string | undefined, after: string) {
  // ~ は 1 つか 2 つだけ（3 つ以上は取り消し線にならない）
  if (char === "~" && count > 2) return;
  const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before));
  const right = !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after));
  const canOpen = char === "_" ? left && (!right || isPunct(before)) : left;
  const canClose = char === "_" ? right && (!left || isPunct(after)) : right;
  let rest = count;
  if (canClose) {
    for (let k = stack.length - 1; k >= 0 && rest > 0; k--) {
      const open = stack[k];
      if (open.char !== char || (char === "~" && open.count !== rest)) continue;
      const take = Math.min(rest, open.count);
      open.count -= take;
      rest -= take;
      stack.splice(open.count === 0 ? k : k + 1);
    }
  }
  if (rest > 0 && canOpen) stack.push({ char, count: rest });
}
