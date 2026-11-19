import type { CSSProperties } from "react";
import type { SubagentEntry } from "@shared/chat/subagents";

/**
 * サブエージェントの色の順（色相）。続けて起動したものどうしが似た色にならないよう、離れた色を交互に並べる
 * （プロジェクトと同じ 10 色。赤はエラー、橙は実行中の枠（Claude の色）と紛れるので後ろに回す）
 */
const AGENT_HUES = [222, 135, 292, 48, 172, 330, 262, 200, 28, 0] as const;

/**
 * サブエージェントの色相。メインが起動したもの（いちばん外側）に、起動した順に色を回し（あとから起動したものが足されても、前のものの色は変わらない）、
 * サブエージェントの中で起動したもの（入れ子。2 階層目より深いものも）は、いちばん外側の祖先と同じ色にする（どの仕事の配下かを色で見分けられるように）。
 * 親が一覧にない入れ子は、いちばん外側として数える。カードの縦線・目次の点・動きの線で同じ色にするため、アーカイブで隠したものも含めた一覧全体から決める
 */
export function agentHues(entries: readonly Pick<SubagentEntry, "key" | "parentKey">[]): ReadonlyMap<string, number> {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  // いちばん外側の祖先（輪になっていても止まる）
  const rootOf = (entry: Pick<SubagentEntry, "key" | "parentKey">) => {
    let current = entry;
    const seen = new Set<string>();
    while (current.parentKey !== undefined && !seen.has(current.key)) {
      seen.add(current.key);
      const parent = byKey.get(current.parentKey);
      if (!parent) break;
      current = parent;
    }
    return current.key;
  };
  const rootHues = new Map<string, number>();
  const hues = new Map<string, number>();
  for (const entry of entries) {
    const root = rootOf(entry);
    let hue = rootHues.get(root);
    if (hue === undefined) {
      hue = AGENT_HUES[rootHues.size % AGENT_HUES.length];
      rootHues.set(root, hue);
    }
    hues.set(entry.key, hue);
  }
  return hues;
}

/** サブエージェントの色を要素に渡す style（CSS の --agent-hue。色そのものはテーマに合わせて CSS が決める） */
export const agentHueStyle = (hue: number | undefined): CSSProperties | undefined =>
  hue === undefined ? undefined : ({ "--agent-hue": `${hue}` } as CSSProperties);
