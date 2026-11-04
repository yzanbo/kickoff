// 止まった（失敗・中断）サブエージェントが、あとで親のエージェントにやり直されたか（Node 依存なし。collectSubagents から使う）
import type { SubagentEntry } from "@shared/chat/subagents";

/** 似ているとみなす度合い（説明と依頼文の両方がこれ以上） */
const SIMILAR = 0.5;

/** 2 文字ずつの組（空白は除く） */
function pairs(s: string): Set<string> {
  const t = s.replace(/\s+/g, "");
  const set = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

/**
 * 文の似かた（2 文字ずつの組の重なり。0〜1）。whole = 両方の大きさに対して（Dice 係数。依頼文のような長い文に）、
 * shorter = 短い方に対して（説明のような短い名前に。「調査」と「調査（やり直し）」も似ているとする）
 */
export function textSimilarity(a: string, b: string, base: "whole" | "shorter" = "whole"): number {
  const x = pairs(a);
  const y = pairs(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const p of x) if (y.has(p)) shared++;
  return base === "whole" ? (2 * shared) / (x.size + y.size) : shared / Math.min(x.size, y.size);
}

/**
 * 止まったあとに、親が同じ仕事を新しいサブエージェントでやり直していれば、その行を supersededBy に入れる
 * （再開・やり直すを押すと同じ仕事が重なるため）。止まったあとに始まり、種類が同じで、説明と依頼文の両方が似ているものを探す。
 * 同時に始めた似た依頼（同じ雛形で並べた調査など）は、止まる前に始まっているので数えない
 */
export function markSuperseded(entries: SubagentEntry[]): SubagentEntry[] {
  return entries.map((s) => {
    if ((s.status !== "failed" && s.status !== "stopped") || !s.prompt) return s;
    const stoppedAt = s.endEventId ?? s.startEventId ?? 0;
    const type = s.subagentType ?? "general-purpose";
    const next = entries.find(
      (o) =>
        o !== s &&
        o.prompt !== undefined &&
        (o.startEventId ?? 0) > stoppedAt &&
        (o.subagentType ?? "general-purpose") === type &&
        textSimilarity(o.description, s.description, "shorter") >= SIMILAR &&
        textSimilarity(o.prompt, s.prompt!) >= SIMILAR,
    );
    return next ? { ...s, supersededBy: { key: next.key, description: next.description } } : s;
  });
}
