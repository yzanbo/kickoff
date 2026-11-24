// 書きかけの返答の文の中（強調・コードスパン・リンク・自動リンク・文字参照・数式）で止める所と補う閉じの記号（markdownReveal.ts の revealCut が使う）
import { mayBecomeSingleDollarMath } from "@shared/foundation/markdown/mathGuard";

/** 文の中の書きかけで止める長さの上限（閉じない [ などを書いた文で、止まり続けないように。およそ 2 行） */
export const MAX_INLINE_HOLD = 120;
/** 表の見出し・表の行・数式ブロックで止める長さの上限 */
export const MAX_BLOCK_HOLD = 2000;

/** 文の終わりの、閉じの > がまだの自動リンク */
const AUTOLINK_TAIL = /^<[A-Za-z][A-Za-z0-9+.-]*(:[^\s<>]*)?$/;
/** 文の終わりの、; がまだの文字参照 */
const ENTITY_TAIL = /^&[A-Za-z0-9#]{0,31}$/;

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isPunct = (ch: string | undefined) => ch !== undefined && /[\p{P}\p{S}]/u.test(ch);

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
export function scanInline(text: string, from: number, end: number, shown: number, math: boolean): { hold: number; closers: string; omit: number[] } {
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
