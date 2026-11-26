// 見えない文字（制御文字・文字の並びを変える印・ゼロ幅の文字）。リンクの行き先の判定と、Markdown の中の HTML の属性の文字で同じ一覧を使う
// （見た目と違う行き先・見た目と違う並びの文字を作らせないため）。
// リンクの文字の警告（linkWarnings.ts）は、Unicode の分類（既定で描かない文字すべて）で外すので、この一覧を使わない

/**
 * C0・DEL・C1 の制御文字、ゼロ幅の文字と左右の印（U+200B〜200F）、埋め込み・上書きの印（U+202A〜202E）、
 * 語をつなぐ印・見えない演算子・分離の印（U+2060〜2069）、BOM（U+FEFF）。正規表現の [] の中身
 */
const INVISIBLE_CHAR_RANGES = "\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2069\\ufeff";

const INVISIBLE_CHAR = new RegExp(`[${INVISIBLE_CHAR_RANGES}]`);
const INVISIBLE_CHARS = new RegExp(`[${INVISIBLE_CHAR_RANGES}]`, "g");

/** 見えない文字を含むか */
export const hasInvisibleChar = (text: string): boolean => INVISIBLE_CHAR.test(text);

/** 見えない文字を消した文字 */
export const stripInvisibleChars = (text: string): string => text.replace(INVISIBLE_CHARS, "");
