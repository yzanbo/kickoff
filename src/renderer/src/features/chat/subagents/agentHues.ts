import type { CSSProperties } from "react";
import type { SubagentEntry } from "@shared/chat/subagents";

/**
 * サブエージェントの色の順（色相）。続けて起動したものどうしが似た色にならないよう、離れた色を交互に並べる
 * （プロジェクトと同じ 10 色。赤はエラー、橙は実行中の枠（Claude の色）と紛れるので後ろに回す）
 */
const AGENT_HUES = [222, 135, 292, 48, 172, 330, 262, 200, 28, 0] as const;

/**
 * サブエージェントの色相（一覧の順 = 起動した順に色を回す。あとから起動したものが足されても、前のものの色は変わらない）。
 * カードの縦線・目次の点・動きの線で同じ色にするため、アーカイブで隠したものも含めた一覧全体から決める
 */
export function agentHues(entries: readonly Pick<SubagentEntry, "key">[]): ReadonlyMap<string, number> {
  return new Map(entries.map((s, i) => [s.key, AGENT_HUES[i % AGENT_HUES.length]]));
}

/** サブエージェントの色を要素に渡す style（CSS の --agent-hue。色そのものはテーマに合わせて CSS が決める） */
export const agentHueStyle = (hue: number | undefined): CSSProperties | undefined =>
  hue === undefined ? undefined : ({ "--agent-hue": `${hue}` } as CSSProperties);
