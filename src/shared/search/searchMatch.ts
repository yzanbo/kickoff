import type { ProjectSearchQuery } from "@shared/types";

/** 探し方を決める指定（含める・除外するファイルは使わない） */
export type SearchPatternQuery = Pick<ProjectSearchQuery, "query" | "case_sensitive" | "whole_word" | "regex">;

/** 検索の指定と同じ探し方の正規表現（結果の行の印・置換に使う。作れなければ null） */
export function searchPattern({ query, case_sensitive: caseSensitive, whole_word: wholeWord, regex }: SearchPatternQuery): RegExp | null {
  if (!query) return null;
  let source = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (wholeWord) source = `\\b(?:${source})\\b`;
  try {
    return new RegExp(source, caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

/** 行を、見つかった部分とそれ以外に分ける */
export function splitMatches(text: string, pattern: RegExp | null): { text: string; match: boolean }[] {
  if (!pattern) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  let last = 0;
  pattern.lastIndex = 0;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    // 長さ 0 の一致（^ など）は印を付けず、先へ進める
    if (m[0].length === 0) {
      pattern.lastIndex++;
      continue;
    }
    if (m.index > last) parts.push({ text: text.slice(last, m.index), match: false });
    parts.push({ text: m[0], match: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}

/** 置換の指定（regex なら置換の文の $1・$&・\n などを使う。preserveCase なら見つかった文の大文字・小文字の形に合わせる） */
export interface ReplaceOptions {
  regex: boolean;
  preserveCase: boolean;
}

/** 正規表現の置換の文の \n・\t・\\ を、改行・タブ・\ にする（VS Code と同じ） */
const unescapeReplacement = (replace: string) => replace.replace(/\\([nt\\])/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : "\\"));

/** 置換の文の $$・$&・$`・$'・$1〜$99・$<名前> を、見つかったものから埋める（String.prototype.replace と同じ決まり） */
function expandGroups(template: string, m: RegExpExecArray, input: string): string {
  const groups = m.length - 1;
  return template.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]*>)/g, (all, token: string) => {
    if (token === "$") return "$";
    if (token === "&") return m[0];
    if (token === "`") return input.slice(0, m.index);
    if (token === "'") return input.slice(m.index + m[0].length);
    if (token.startsWith("<")) {
      const name = token.slice(1, -1);
      return m.groups && name in m.groups ? (m.groups[name] ?? "") : all;
    }
    // 2 桁の番号がなければ 1 桁 ＋ 文字として読む（$12 で組が 1 つなら $1 と「2」）
    const two = Number(token);
    if (token.length === 2 && two >= 1 && two <= groups) return m[two] ?? "";
    const one = Number(token[0]);
    if (one >= 1 && one <= groups) return (m[one] ?? "") + token.slice(1);
    return all;
  });
}

/** 見つかった文の大文字・小文字の形を、置換の文に写す（すべて大文字・すべて小文字・頭だけ大文字。どれでもなければそのまま） */
export function matchCase(original: string, replacement: string): string {
  const upper = original.toUpperCase();
  const lower = original.toLowerCase();
  if (upper === lower) return replacement;
  if (original === upper) return replacement.toUpperCase();
  if (original === lower) return replacement.toLowerCase();
  const head = original[0];
  if (head === head.toUpperCase() && head !== head.toLowerCase() && original.slice(1) === original.slice(1).toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** 見つかった 1 つを置き換える文 */
function replacementOf(m: RegExpExecArray, input: string, replace: string, { regex, preserveCase }: ReplaceOptions): string {
  const text = regex ? expandGroups(unescapeReplacement(replace), m, input) : replace;
  return preserveCase ? matchCase(m[0], text) : text;
}

/** 行を、見つかった部分（置き換える文つき）とそれ以外に分ける（結果の行で置換したあとの形を見せる） */
export function splitReplacements(text: string, pattern: RegExp | null, replace: string, options: ReplaceOptions): { text: string; match: boolean; replacement?: string }[] {
  if (!pattern) return [{ text, match: false }];
  const parts: { text: string; match: boolean; replacement?: string }[] = [];
  let last = 0;
  pattern.lastIndex = 0;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    if (m[0].length === 0) {
      pattern.lastIndex++;
      continue;
    }
    if (m.index > last) parts.push({ text: text.slice(last, m.index), match: false });
    parts.push({ text: m[0], match: true, replacement: replacementOf(m, text, replace, options) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}

/** 行の中の見つかった部分をすべて置き換える（置き換えた数も返す。長さ 0 の一致は置き換えない） */
export function replaceInLine(text: string, pattern: RegExp, replace: string, options: ReplaceOptions): { text: string; count: number } {
  const parts = splitReplacements(text, pattern, replace, options);
  return { text: parts.map((p) => p.replacement ?? p.text).join(""), count: parts.filter((p) => p.match).length };
}
