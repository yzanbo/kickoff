import { MessageSquare, PanelRight } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type UIEvent } from "react";
import type { SubagentEntry } from "@shared/chat/subagents";
import { cx } from "@/lib/cx";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { formatStamp } from "@/lib/time";
import { useChatPane, useChatPaneState } from "@/features/chat/pane/chatPaneContext";
import { useSubagentsView } from "@/features/chat/subagents/subagentsContext";
import { childrenOf, type SubagentTree } from "@/features/chat/subagents/subagentTree";
import { agentHueStyle } from "@/features/chat/subagents/agentHues";
import { activityRows, agentTargetOf, filterActivity, type ActivityFilter, type ActivityRow } from "./activityRows";
import { layoutRails } from "./activityRails";
import { ActivityLine } from "./ActivityLine";
import { ActivityFocusBar } from "./ActivityFocusBar";
import { useActivityFocus } from "./useActivityFocus";

/** 一度に描く行の数（上の「以前の動きを表示」で、この数ずつ前を足す。長いチャットでも全部は描かない） */
const ACTIVITY_WINDOW = 300;
/** 一番下を見ているとみなす、下端からの距離（ここにいる間は新しい行に付いていく） */
const FOLLOW_SLACK_PX = 40;
const ALL: ActivityFilter = { kind: "all" };

/**
 * 動き: メインとすべてのサブエージェントの動きを、1 本の時系列に並べる（チャットの見出しの「会話 / 動き」で、会話と同じ場所に出す）。
 * 左の線は、メインの線から起動した時刻でサブエージェントの線が枝分かれし、終わった時刻で閉じる（配下であること・いつ始まりいつ終わったか・
 * どこが並行していたかを 1 枚で見せる）。上のチップでエージェントを絞り込み（その配下ごと）、行を押すと会話のその場所へ移る。
 * カードの「動きで見る」では、絞り込まずにそのサブエージェントと配下の行をすべて強調し、初めの行へ移る（useActivityFocus。↑↓ で順に）
 */
export function ActivityView({ rel }: { rel: (s: string) => string }) {
  const view = useSubagentsView();
  const pane = useChatPane();
  const filter = useChatPaneState((s) => s.activityFilter) ?? ALL;
  // サブエージェントの行の右クリック: 開き方を選ぶ（流れの中のカード / 右の欄）
  const menu = useContextMenu<{ key: string; eventId?: number }>();
  const [limit, setLimit] = useState(ACTIVITY_WINDOW);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const events = view?.events;
  const tree = view?.tree;
  const busy = view?.busy ?? false;
  const rows = useMemo(() => (events && tree ? activityRows(events, tree, busy) : []), [events, tree, busy]);
  const shown = useMemo(() => (tree ? filterActivity(rows, tree, filter) : rows), [rows, tree, filter]);
  // 線は絞り込んだ行の全体で決める（描くのが最近の分だけでも、それより前から続く線を上から通す）
  const rails = useMemo(() => layoutRails(shown), [shown]);

  // 一番下を見ている間は、新しい行に付いていく（初めと、絞り込みを変えたときは一番下から）
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const lastKey = shown.at(-1)?.key;
  useLayoutEffect(() => {
    following.current = true;
  }, [filter]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [lastKey, shown.length, filter]);
  const focus = useActivityFocus(shown, tree, scrollRef, following);
  // 強調している行が描く範囲より前なら、そこから描く（描き足した分は、次からも描いたまま）
  const start = Math.min(Math.max(0, shown.length - limit), focus.currentIndex ?? Infinity);
  useLayoutEffect(() => {
    if (focus.currentIndex !== undefined) setLimit((n) => Math.max(n, shown.length - focus.currentIndex!));
  }, [focus.currentIndex, shown.length]);
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX;
  };

  if (!view || !tree) return null;
  const name = (agent: string | null) => (agent === null ? "メイン" : (tree.byKey.get(agent)?.description ?? "サブエージェント"));
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  // 行を押したら会話のその場所へ。サブエージェントの行は設定の開き方で（流れの中 = そのカードの中へ / 右の欄 = 右の欄のその画面の中へ。
  // 起動・終わり・いまの動きの行は、そのサブエージェントを開く）
  const open = (row: ActivityRow, eventId = row.eventId) => {
    const target = agentTargetOf(row, eventId);
    if (target) pane.openSubagent(target.key, target.eventId);
    else pane.revealInConversation(eventId, null);
  };
  // 右クリック（サブエージェントの行で、右の欄を置ける画面だけ）: 設定によらず、どちらで開くかを選ぶ
  const openMenu = (row: ActivityRow, e: MouseEvent, eventId = row.eventId) => {
    const target = agentTargetOf(row, eventId);
    if (target && pane.canOpenSide) menu.open(e, target);
  };
  // 行の右端の 2 つのボタン（右クリックのメニューと同じ）: 会話の流れの中で見る / 右の欄で開く
  const pick = (row: ActivityRow, where: "inline" | "side") => {
    const target = agentTargetOf(row);
    if (!target) return;
    if (where === "side") pane.openSubagentSide(target.key, target.eventId);
    else pane.revealSubagent(target.key, target.eventId);
  };
  const running = [...tree.byKey.values()].filter((s) => s.status === "running").length;
  // 別の日の行があれば、時刻の欄を日付の入る幅に（すべての行で同じ幅にそろえる）
  const timeWidth = { "--activity-time-w": shown.some((r) => formatStamp(r.at).includes(" ")) ? "96px" : "62px" } as CSSProperties;

  return (
    <div className="activity-wrap">
      <Filters tree={tree} hues={view.hues} filter={filter} running={running} onChange={(f) => pane.show("activity", f)} />
      {focus.key !== null && <ActivityFocusBar focus={focus} name={name(focus.key)} hue={view.hues.get(focus.key)} onClear={pane.clearActivityFocus} />}
      <div ref={scrollRef} className="activity" tabIndex={-1} onScroll={onScroll}>
        <div className="activity-inner" style={timeWidth}>
          {start > 0 && (
            <button type="button" className="link-button activity-more" onClick={() => setLimit((n) => n + ACTIVITY_WINDOW)}>
              以前の動きを表示（あと {start} 件）
            </button>
          )}
          {shown.length === 0 && <p className="muted small activity-empty">まだ動きがありません</p>}
          {shown.slice(start).map((row, i) => (
            <ActivityLine
              key={row.key}
              row={row}
              rail={rails.rows[start + i]}
              width={rails.width}
              name={name(row.agent)}
              hues={view.hues}
              rel={rel}
              expanded={expanded.has(row.key)}
              highlighted={focus.keys.has(row.key)}
              current={focus.currentKey === row.key}
              onToggle={toggle}
              onOpen={open}
              onMenu={openMenu}
              onPick={pane.canOpenSide ? pick : undefined}
            />
          ))}
        </div>
      </div>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="サブエージェントの開き方" onClose={menu.close}>
          <MenuItem onSelect={() => pane.revealSubagent(menu.menu!.value.key, menu.menu!.value.eventId)}>
            <MessageSquare size={14} /> 会話の流れの中で見る
          </MenuItem>
          <MenuItem onSelect={() => pane.openSubagentSide(menu.menu!.value.key, menu.menu!.value.eventId)}>
            <PanelRight size={14} /> 右の欄で開く
          </MenuItem>
        </PopupMenu>
      )}
    </div>
  );
}

/** 絞り込みのチップ（すべて・メイン・サブエージェントを起動した順に。入れ子は道筋を説明に。押すとその配下ごとに絞る） */
function Filters({
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
  const walk = (parent: string | undefined, path: string, depth: number) => {
    for (const entry of childrenOf(tree, parent)) {
      agents.push({ entry, path });
      if (depth < 32) walk(entry.key, `${path}${entry.description} › `, depth + 1);
    }
  };
  walk(undefined, "", 0);
  const chip = (active: boolean, label: string, next: ActivityFilter, extra: { hue?: number; title?: string } = {}) => (
    <button
      key={next.kind === "agent" ? next.key : next.kind}
      type="button"
      role="radio"
      aria-checked={active}
      className={cx("activity-chip", active && "active")}
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
      {chip(filter.kind === "main", "メイン", { kind: "main" })}
      {agents.map(({ entry, path }) =>
        chip(filter.kind === "agent" && filter.key === entry.key, entry.description, { kind: "agent", key: entry.key }, {
          hue: hues.get(entry.key),
          title: `${path}${entry.description}（このサブエージェントと、その中で起動したものの動き）`,
        }),
      )}
      {running > 0 && <span className="activity-running">{running} 件動作中</span>}
    </div>
  );
}
