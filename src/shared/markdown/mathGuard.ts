// 数式の書き方の決まり（Markdown の中の $…$・\(…\)・\[…\]）。チャットの返答・メモ・GitHub の表示と、スマホのアプリで同じに読む。
// $$…$$ はいつも数式。1 つの $ と \( \) は、値段の「$5」やシェルの「$HOME」と取り違えないよう、中身が数式らしいときだけ数式にする

/** 1 つの $ の数式の中身の長さの上限（長い文は数式ではなく、$ で挟まれたふつうの文とみなす） */
export const INLINE_MATH_MAX = 60;

/** 数式の外で、開きの $ の前・閉じの $ の後ろに来てはいけない文字（英数字。「US$5」「$5USD」） */
const WORD_CHAR = /[A-Za-z0-9_]/;

/** 数式らしい記号（TeX の命令・上付き・下付き・かっこ・比べる記号・数学の記号） */
const MATH_MARK = /[\\^_{}=<>|]|[±×÷≤≥≠≈∑∏∫√∞∂∇∈∉⊂⊆∪∩→←↔⇒⇔∀∃πθλμσφωαβγδε]/u;

/** 英字と数の式（2x+1・a-b・n*(n+1)・x/y）。演算子を 1 つ以上含む */
const EXPRESSION = /^[A-Za-z0-9.,()]+(?: ?[-+*/] ?[A-Za-z0-9.,()]+)+$/;

/** 文の言葉らしいもの: 英字 4 文字以上の単語・かな漢字が 2 文字以上続く・% */
const PROSE = /[A-Za-z]{4,}|[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]{2}|%/u;

/** TeX の命令（\frac・\alpha）と、その後ろの {…} の中身の文（\text{面積}）を除いた文（文の言葉らしいかを見るため） */
function withoutCommands(tex: string): string {
  return tex.replace(/\\(?:text|mathrm|operatorname|mbox)\{[^}]*\}/g, " ").replace(/\\[A-Za-z]+/g, " ");
}

/**
 * 中身が数式らしいか（1 つの $ と \( \) で囲んだもの）。
 * 1 文字の英字（x）・英字を含む式（2x+1）・TeX の記号や数学の記号を含むもの（x^2・a_1・\alpha・a \le b）を数式とみなす。
 * 数だけ（5・3.14）・文の言葉らしいもの（4 文字以上の英単語・日本語）は数式にしない
 */
export function looksLikeMath(content: string): boolean {
  if (content === "" || content.length > INLINE_MATH_MAX) return false;
  if (/^\s|\s$/.test(content) || content.includes("$") || content.includes("`")) return false;
  if (/^[A-Za-z]$/.test(content)) return true;
  if (PROSE.test(withoutCommands(content))) return false;
  if (MATH_MARK.test(content)) return true;
  return EXPRESSION.test(content) && /[A-Za-z]/.test(content);
}

/**
 * 1 つの $ で囲んだ部分を数式にするか。before は開きの $ の前の文字、after は閉じの $ の後ろの文字（文の頭・終わりなら undefined）。
 * 前後が英数字なら数式にしない（「US$5」）。中身は looksLikeMath
 */
export function isSingleDollarMath(content: string, before: string | undefined, after: string | undefined): boolean {
  if (before !== undefined && (WORD_CHAR.test(before) || before === "\\")) return false;
  if (after !== undefined && WORD_CHAR.test(after)) return false;
  return looksLikeMath(content);
}

/** コードの部分（``` / ~~~ の囲み・`…` のインラインのコード）と、それ以外に分ける。コードの中は書き換えない */
function splitCode(markdown: string): { text: string; code: boolean }[] {
  const parts: { text: string; code: boolean }[] = [];
  const pattern = /^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\2[`~]*[ \t]*(?=\n|$)|$)|(`+)[\s\S]*?\3/gm;
  let last = 0;
  for (const m of markdown.matchAll(pattern)) {
    if (m.index > last) parts.push({ text: markdown.slice(last, m.index), code: false });
    parts.push({ text: m[0], code: true });
    last = m.index + m[0].length;
  }
  if (last < markdown.length) parts.push({ text: markdown.slice(last), code: false });
  return parts;
}

/**
 * \(…\) と \[…\] の数式を、Markdown の数式の書き方（$$…$$）に書き換える（Markdown では \( が「(」のエスケープになり、そのままでは数式として読めないため）。
 * 行の頭から始まる \[…\] は、段落の数式（前後に改行を入れた $$）にする。
 * \(…\) と、行の途中の 1 行の \[…\] は、中身が数式らしいときだけ文の中の数式（$$…$$ を文の中に）にする。コードの中は変えない
 */
export function convertTexDelimiters(markdown: string): string {
  if (!markdown.includes("\\(") && !markdown.includes("\\[")) return markdown;
  return splitCode(markdown)
    .map((part) => {
      if (part.code) return part.text;
      return part.text
        .replace(/^([ \t]*)\\\[([\s\S]+?)\\\][ \t]*$/gm, (_all, indent: string, tex: string) => `${indent}$$\n${tex.trim()}\n$$`)
        .replace(/\\\((.+?)\\\)|\\\[(.+?)\\\]/g, (all, paren: string | undefined, bracket: string | undefined) => {
          const tex = (paren ?? bracket ?? "").trim();
          return looksLikeMath(tex) ? `$$${tex}$$` : all;
        });
    })
    .join("");
}

/** 文の中の数式の場所（メモのエディタで数式を描くため）。from〜to は書いた記号も含む範囲、tex は中身、display は段落の数式か */
export interface MathRange {
  from: number;
  to: number;
  tex: string;
  display: boolean;
}

/** 行の頭から行の終わりまでを占めるか（段落の数式として見せるか） */
function fillsLines(text: string, from: number, to: number): boolean {
  const before = text.slice(text.lastIndexOf("\n", from - 1) + 1, from);
  const lineEnd = text.indexOf("\n", to);
  const after = text.slice(to, lineEnd < 0 ? text.length : lineEnd);
  return before.trim() === "" && after.trim() === "";
}

/**
 * Markdown の文の中の数式の場所を前から探す（Markdown の表示と同じ決まり: $$…$$ と行の頭からの \[…\] はいつも、
 * \(…\)・行の途中の \[…\]・1 つの $ は中身が数式らしいときだけ）。コードの中・\$ は数式にしない。範囲は重ならない
 */
export function mathRanges(markdown: string): MathRange[] {
  const out: MathRange[] = [];
  let offset = 0;
  for (const part of splitCode(markdown)) {
    if (!part.code) scanMath(markdown, part.text, offset, out);
    offset += part.text.length;
  }
  return out;
}

/** コードでない部分 text（全体の base 文字目から）の数式を out に足す */
function scanMath(full: string, text: string, base: number, out: MathRange[]) {
  const pattern = /\\\$|\$\$([\s\S]+?)\$\$|(?<=^[ \t]*)\\\[([\s\S]+?)\\\]|\\\((.+?)\\\)|\\\[(.+?)\\\]|\$([^$\n]+?)\$/gm;
  for (const m of text.matchAll(pattern)) {
    const from = base + m.index;
    const to = from + m[0].length;
    if (m[1] !== undefined) {
      if (m[1].trim() !== "") out.push({ from, to, tex: m[1].trim(), display: fillsLines(full, from, to) });
    } else if (m[2] !== undefined) {
      out.push({ from, to, tex: m[2].trim(), display: true });
    } else if (m[3] !== undefined || m[4] !== undefined) {
      // \(…\) と行の途中の \[…\]
      const tex = (m[3] ?? m[4] ?? "").trim();
      if (looksLikeMath(tex)) out.push({ from, to, tex, display: false });
    } else if (m[5] !== undefined) {
      const before = from > 0 ? full[from - 1] : undefined;
      const after = to < full.length ? full[to] : undefined;
      if (isSingleDollarMath(m[5], before, after)) out.push({ from, to, tex: m[5], display: false });
    }
  }
}

/** 数式の書き方を含みうるか（数式の部品を読み込むかの目安。含まなければ数式の処理を飛ばす） */
export function mayContainMath(markdown: string): boolean {
  return markdown.includes("$") || markdown.includes("\\(") || markdown.includes("\\[");
}
