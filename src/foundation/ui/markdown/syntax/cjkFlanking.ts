/**
 * 強調（* _）・取り消し線（~~）の印の並びが、開ける・閉じられるかの判定（日本語向けに緩めた決まり markdown-cjk-friendly）。
 * 表示の読み取り（remark-cjk-friendly・remark-cjk-friendly-gfm-strikethrough）の tokenizeAttention・tokenizeStrikethrough と同じ式を、
 * 同じ文字の分け方（micromark-extension-cjk-friendly-util）で書く。書きかけの返答の補う印（markdownRevealInline.ts）と
 * ノートの編集の画面（lezer の拡張）が使う（判定がずれると、書きかけの間・編集の画面だけ形が変わる）
 */
import {
  classifyCharacter,
  classifyPrecedingCharacter,
  isCjk,
  isCjkOrIvs,
  isIvs,
  isNonCjkPunctuation,
  isSpaceOrPunctuation,
  isUnicodeWhitespace,
} from "micromark-extension-cjk-friendly-util";

/** 印の並びの前後の文字（コードポイント。行・文の端は null = 空白と同じ） */
export interface Around {
  previous: number | null;
  /** previous のさらに前の文字（previous が異体字セレクタのときだけ読む） */
  twoPrevious: () => number | null;
  next: number | null;
}

export interface Sides {
  open: boolean;
  close: boolean;
}

const ASTERISK = 42;
const UNDERSCORE = 95;
/** 取り消し線の印。GFM では強調の判定でも「印」として扱う（attentionMarkers） */
const TILDE = 126;

/** 前の文字の分類（異体字セレクタなら、その前の文字で分ける） */
const beforeOf = (a: Around) => classifyPrecedingCharacter(classifyCharacter(a.previous), a.twoPrevious, a.previous);

/** 強調の印（* か _）の並び */
export function attentionSides(marker: "*" | "_", a: Around): Sides {
  const before = beforeOf(a);
  const after = classifyCharacter(a.next);
  const beforeNonCjkPunctuation = isNonCjkPunctuation(before);
  const beforeSpaceOrNonCjkPunctuation = beforeNonCjkPunctuation || isUnicodeWhitespace(before) || a.previous === ASTERISK || a.previous === UNDERSCORE;
  const afterNonCjkPunctuation = isNonCjkPunctuation(after);
  const afterSpaceOrNonCjkPunctuation = afterNonCjkPunctuation || isUnicodeWhitespace(after) || a.next === ASTERISK || a.next === UNDERSCORE;
  const open = !afterSpaceOrNonCjkPunctuation || (afterNonCjkPunctuation && (beforeSpaceOrNonCjkPunctuation || isCjkOrIvs(before))) || a.next === TILDE;
  const close = !beforeSpaceOrNonCjkPunctuation || (beforeNonCjkPunctuation && (afterSpaceOrNonCjkPunctuation || isCjk(after))) || a.previous === TILDE;
  if (marker === "*") return { open, close };
  // _ は語の中で強調にしない（snake_case を守る）
  return { open: open && (isSpaceOrPunctuation(before) || !close), close: close && (isSpaceOrPunctuation(after) || !open) };
}

/** 取り消し線の印（~~）の並び */
export function strikethroughSides(a: Around): Sides {
  const before = beforeOf(a);
  const rawBefore = classifyCharacter(a.previous);
  const after = classifyCharacter(a.next);
  const beforeSpaceOrNonCjkPunctuation = isNonCjkPunctuation(before) || isUnicodeWhitespace(before);
  const afterSpaceOrNonCjkPunctuation = isNonCjkPunctuation(after) || isUnicodeWhitespace(after);
  const beforeCjkOrIvs = isCjk(before) || isIvs(rawBefore);
  return {
    open: !afterSpaceOrNonCjkPunctuation || (isNonCjkPunctuation(after) && (beforeSpaceOrNonCjkPunctuation || beforeCjkOrIvs)),
    close: !beforeSpaceOrNonCjkPunctuation || (isNonCjkPunctuation(rawBefore) && (afterSpaceOrNonCjkPunctuation || isCjk(after))),
  };
}

/** text の at の手前の文字（from より前は見ない。サロゲートペアは 1 つの文字として読む） */
export function codePointBefore(text: string, at: number, from = 0): number | null {
  if (at <= from) return null;
  const low = text.charCodeAt(at - 1);
  if (low >= 0xdc00 && low <= 0xdfff && at - 2 >= from) {
    const high = text.charCodeAt(at - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.codePointAt(at - 2) ?? null;
  }
  return low;
}

/** text の at の文字（end より後ろは見ない） */
export const codePointAt = (text: string, at: number, end = text.length): number | null => (at < end ? (text.codePointAt(at) ?? null) : null);

/** text の at の手前の印の並びの前後（from から end までの範囲で見る） */
export function aroundRun(text: string, start: number, runEnd: number, from = 0, end = text.length): Around {
  const previous = codePointBefore(text, start, from);
  const width = previous !== null && previous > 0xffff ? 2 : 1;
  return { previous, twoPrevious: () => codePointBefore(text, start - width, from), next: codePointAt(text, runEnd, end) };
}
