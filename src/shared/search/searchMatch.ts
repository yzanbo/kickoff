import type { ProjectSearchQuery } from "@shared/types";

/** 検索の指定と同じ探し方の正規表現（結果の行で、見つかった部分に印を付けるのに使う。作れなければ null） */
export function searchPattern({ query, case_sensitive: caseSensitive, whole_word: wholeWord, regex }: ProjectSearchQuery): RegExp | null {
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
