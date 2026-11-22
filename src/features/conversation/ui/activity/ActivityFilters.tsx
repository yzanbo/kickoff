import type { SubagentEntry } from "@shared/chat/subagents";
import { walkDown } from "@shared/foundation/tree";
import { cx } from "@/foundation/ui/lib/cx";
import type { ActivityFilter } from "@/features/chat/ui";
import { agentHueStyle, childrenOf, type SubagentTree } from "@/features/subagents/ui";

/** 絞り込みのチップ（すべて・メイン・サブエージェントを起動した順に。入れ子は道筋を説明に。押すとその配下ごとに絞る） */
export function ActivityFilters({
  tree,
  hues,
  filter,
  running,
  onChange,
}: {
  tree: SubagentTree;
  hues: ReadonlyMap<string, number>;
  filter: ActivityFilter;
  running: number;
  onChange: (filter: ActivityFilter) => void;
}) {
  const agents: { entry: SubagentEntry; path: string }[] = [];
  // 外側からの道筋（「洗い出し › 」）。子の道筋は親の道筋に親の名前を足したもの
  const pathOf = new Map<string | undefined, string>();
  walkDown(childrenOf(tree, undefined), (s) => childrenOf(tree, s.key), (entry) => {
    const path = (entry.parentKey !== undefined && pathOf.get(entry.parentKey)) || "";
    agents.push({ entry, path });
    pathOf.set(entry.key, `${path}${entry.description} › `);
  });
  const chip = (active: boolean, label: string, next: ActivityFilter, extra: { hue?: number; title?: string } = {}) => (
    <button
      key={next.kind === "agent" ? next.key : next.kind}
      type="button"
      role="radio"
      aria-checked={active}
      className={cx("activity-chip pill", active && "active")}
      title={extra.title}
      style={agentHueStyle(extra.hue)}
      onClick={() => onChange(next)}
    >
      {extra.hue !== undefined && <span className="agent-dot" aria-hidden />}
      {label}
    </button>
  );
  return (
    <div className="activity-filters" role="radiogroup" aria-label="動きの絞り込み">
      {chip(filter.kind === "all", "すべて", { kind: "all" })}
      {chip(filter.kind === "main", "メインエージェント", { kind: "main" })}
      {agents.map(({ entry, path }) =>
        chip(filter.kind === "agent" && filter.key === entry.key, entry.description, { kind: "agent", key: entry.key }, {
          hue: hues.get(entry.key),
          title: `${path}${entry.description}（このサブエージェントと、その中で起動したものの動き）`,
        }),
      )}
      {running > 0 && <span className="activity-running">{running} 件作業中</span>}
    </div>
  );
}
