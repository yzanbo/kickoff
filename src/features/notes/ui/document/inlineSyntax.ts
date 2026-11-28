// 行の中の書き方のうち、返答の表示と同じに見せるための純粋な関数: 行の中の HTML のタグの組（同じ行で開きと閉じがそろったもの）と、
// 実体参照（&amp; など）の文字
import type { Tree } from "@lezer/common";
import { decodeNamedCharacterReference } from "decode-named-character-reference";
import { HTML_TAGS, VOID_TAGS } from "@/foundation/ui/markdown/html/htmlAllowlist";
import { lineStartOf } from "./blockWalk";

/** 行の中の HTML 1 つ（開きから閉じまで。閉じの要らないタグはそれだけ） */
export interface InlineHtmlRange {
  from: number;
  to: number;
}

const TAG = /^<(\/?)([a-z][a-z0-9-]*)\b[^>]*?(\/?)>$/;

/**
 * 行の中の HTML のうち、返答の表示が要素として描くもの: 一覧（htmlAllowlist）の小文字のタグで、同じ行の中で開きと閉じがそろったもの
 * （閉じの要らないタグ（<br> など）はそれだけで）。入れ子は外側の組だけを返す。そろわないものは文字のまま（返答の表示と同じ）
 */
export function inlineHtmlRanges(tree: Tree, text: string, from = 0, to = text.length): InlineHtmlRange[] {
  const out: InlineHtmlRange[] = [];
  // 行ごとのタグ（HTMLTag の節。文の中のものだけ）
  const byLine = new Map<number, { from: number; to: number; name: string; close: boolean; single: boolean }[]>();
  tree.iterate({
    from,
    to,
    enter(n) {
      if (n.name !== "HTMLTag") return;
      const m = TAG.exec(text.slice(n.from, n.to));
      if (!m || !HTML_TAGS.has(m[2])) return;
      const line = lineStartOf(text, n.from);
      const tags = byLine.get(line) ?? [];
      tags.push({ from: n.from, to: n.to, name: m[2], close: m[1] === "/", single: m[3] === "/" || VOID_TAGS.has(m[2]) });
      byLine.set(line, tags);
    },
  });
  for (const tags of byLine.values()) {
    const stack: { name: string; from: number }[] = [];
    for (const tag of tags) {
      if (tag.close) {
        const top = stack[stack.length - 1];
        if (!top || top.name !== tag.name) {
          stack.length = 0;
          continue;
        }
        stack.pop();
        if (!stack.length) out.push({ from: top.from, to: tag.to });
      } else if (tag.single) {
        if (!stack.length) out.push({ from: tag.from, to: tag.to });
      } else stack.push({ name: tag.name, from: tag.from });
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

/** 実体参照の文字（&amp; → &・&#38; → &・&#x26; → &。読めなければ null） */
export function decodeEntity(entity: string): string | null {
  const m = /^&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{0,31}));$/.exec(entity);
  if (!m) return null;
  if (m[3]) {
    const named = decodeNamedCharacterReference(m[3]);
    return named === false ? null : named;
  }
  const code = m[1] ? Number(m[1]) : parseInt(m[2], 16);
  // 0・サロゲート・範囲の外は置き換えの文字（返答の表示と同じ）
  return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? "�" : String.fromCodePoint(code);
}
