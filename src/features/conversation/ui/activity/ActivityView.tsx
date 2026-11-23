import "./ActivityView.css";
import "@/features/conversation/ui/timeline/Timeline.css";
import { MessageSquare, PanelRight } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type UIEvent } from "react";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { formatStamp } from "@/foundation/ui/lib/time";
import { useActivityNav, useSubagentNav } from "@/features/chat/ui";
import { useCell } from "@/foundation/ui/store";
import { useSubagentsView } from "@/features/subagents/ui/subagentsContext";
import { activityRows, agentName, agentTargetOf, filterActivity, type ActivityRow } from "./activityRows";
import { ActivityFilters } from "./ActivityFilters";
import { useActivityWindow } from "./useActivityWindow";
import { flipRails, layoutRails } from "./activityRails";
import { ActivityLine } from "./ActivityLine";
import { ActivityFocusBar } from "./ActivityFocusBar";
import { useActivityFocus } from "./useActivityFocus";

/** 一番上を見ているとみなす、上端からの距離（ここにいる間は新しい行に付いていく） */
const FOLLOW_SLACK_PX = 40;

/**
 * 動き: メインとすべてのサブエージェントの動きを、1 本の時系列に並べる（チャットの見出しの「会話 / 動き」で、会話と同じ場所に出す）。
 * 履歴のタブと同じく、上を最新にする。
 * 左の線は、メインの線から起動した時刻でサブエージェントの線が枝分かれし（上へ伸びる）、終わった時刻で閉じる（配下であること・いつ始まりいつ終わったか・
 * どこが並行していたかを 1 枚で見せる）。上のチップでエージェントを絞り込み（その配下ごと）、行を押すと会話のその場所へ移る。
 * カードの「動きで見る」では、絞り込まずにそのサブエージェントと配下の行をすべて強調し、いちばん上（最新）の行へ移る（useActivityFocus。上 / 下のボタンで順に）
 * 描くのは見えている所の近くの行だけ（画素で決める窓 useRowWindow。新しい側は上。外は測った高さ・見積もりの箱）。下の端（いちばん古い行）に
 * 近づいたら、前の記録を読む（読んでいる間は下に「読み込み中…」）
 */
export function ActivityView({ rel }: { rel: (s: string) => string }) {
  const view = useSubagentsView();
  const subagents = useSubagentNav();
  const activity = useActivityNav();
  const filter = useCell(activity.filter);
  // サブエージェントの行の右クリック: 開き方を選ぶ（流れの中のカード / 右の欄）
  const menu = useContextMenu<{ key: string; eventId?: number }>();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // 中身のまま読んだ記録から（末尾より前は、下の端に近づいたら読み足す）
  const events = view?.loaded;
  const tree = view?.tree;
  const busy = view?.busy ?? false;
  const rows = events && tree ? activityRows(events, tree, busy) : [];
  const shown = tree ? filterActivity(rows, tree, filter) : rows;
  // 上を最新にして並べる（履歴のタブと同じ）。線は絞り込んだ行の全体を時刻の順で決めてから逆にする
  // （描くのが最近の分だけでも、それより前から続く線を下から通す）
  const ordered = [...shown].reverse();
  // 最新の行より先へ線を続けるのは、まだ作業中の持ち主（作業中のサブエージェントと、チャットが作業中ならメイン）だけ
  const active = new Set<string | null>(tree ? [...tree.byKey.values()].filter((s) => s.status === "running").map((s) => s.key) : []);
  if (busy) active.add(null);
  const rails = flipRails(layoutRails(shown, active));

  // 一番上を見ている間は、新しい行に付いていく（初めと、絞り込みを変えたときは一番上から）
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const w = useActivityWindow({ rows: ordered, expanded, scrollRef, innerRef, chatId: view?.chatId ?? 0, filter, hasEarlier: view?.hasEarlier ?? false });
  const newestKey = ordered[0]?.key;
  useLayoutEffect(() => {
    following.current = true;
  }, [filter]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && following.current) el.scrollTop = 0;
  }, [newestKey, ordered.length, filter]);
  const focus = useActivityFocus(ordered, tree, scrollRef, following, w.reveal);
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    following.current = e.currentTarget.scrollTop < FOLLOW_SLACK_PX;
    w.onScroll();
  };

  if (!view || !tree) return null;
  const name = (agent: string | null) => agentName(tree, agent);
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  // 行を押したら会話のその場所へ。サブエージェントの行は設定の開き方で（流れの中 = そのカードの中へ / 右の欄 = 右の欄のその画面の中へ。
  // 起動・終わり・いまの動きの行は、そのサブエージェントを開く）
  // 省いた eventId は行のもの（既定の引数に行の値を書くと、React Compiler が最適化できない）
  const open = (row: ActivityRow, at?: number) => {
    const eventId = at === undefined ? row.eventId : at;
    const target = agentTargetOf(row, eventId);
    if (target) subagents.open(target.key, target.eventId);
    else activity.revealInConversation(eventId, null);
  };
  // 右クリック（サブエージェントの行で、右の欄を置ける画面だけ）: 設定によらず、どちらで開くかを選ぶ
  const openMenu = (row: ActivityRow, e: MouseEvent, at?: number) => {
    const eventId = at === undefined ? row.eventId : at;
    const target = agentTargetOf(row, eventId);
    if (target && subagents.canOpenSide) menu.open(e, target);
  };
  // 行の右端の 2 つのボタン（右クリックのメニューと同じ）: 会話の流れの中で見る / 右の欄で開く
  const pick = (row: ActivityRow, where: "inline" | "side") => {
    const target = agentTargetOf(row);
    if (!target) return;
    if (where === "side") subagents.openSide(target.key, target.eventId);
    else subagents.reveal(target.key, target.eventId);
  };
  const running = [...tree.byKey.values()].filter((s) => s.status === "running").length;
  // 別の日の行があれば、時刻の欄を日付の入る幅に（すべての行で同じ幅にそろえる）
  const timeWidth = { "--activity-time-w": shown.some((r) => formatStamp(r.at).includes(" ")) ? "96px" : "62px" } as CSSProperties;

  return (
    <div className="activity-wrap">
      <ActivityFilters tree={tree} hues={view.hues} filter={filter} running={running} onChange={(f) => activity.show("activity", f)} />
      {focus.key !== null && <ActivityFocusBar focus={focus} name={name(focus.key)} hue={view.hues.get(focus.key)} onClear={activity.clearFocus} />}
      <div ref={scrollRef} className="activity" tabIndex={-1} onScroll={onScroll}>
        <div className="activity-inner" style={timeWidth} ref={innerRef}>
          {shown.length === 0 && <p className="muted small activity-empty">まだ動きがありません</p>}
          {/* 行と箱は 1 つの並びにする（入れ子の配列にすると、箱が増えたときに後ろの行がすべて作り直される） */}
          {w.runs.flatMap((run) =>
            run.kind === "box"
              ? [<div key={`box-${ordered[run.start].key}`} className="activity-box" style={{ height: run.height }} aria-hidden />]
              : ordered.slice(run.start, run.end).map((row, j) => (
                  <ActivityLine
                    key={row.key}
                    row={row}
                    rail={rails.rows[run.start + j]}
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
                    onPick={subagents.canOpenSide ? pick : undefined}
                    rowRef={w.measureRef(row.key)}
                  />
                )),
          )}
          {w.loading && (
            <div className="timeline-loading" role="status">
              読み込み中…
            </div>
          )}
        </div>
      </div>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="サブエージェントの開き方" onClose={menu.close}>
          <MenuItem onSelect={() => subagents.reveal(menu.menu!.value.key, menu.menu!.value.eventId)}>
            <MessageSquare size={14} /> 会話の流れの中で見る
          </MenuItem>
          <MenuItem onSelect={() => subagents.openSide(menu.menu!.value.key, menu.menu!.value.eventId)}>
            <PanelRight size={14} /> 右の欄で開く
          </MenuItem>
        </PopupMenu>
      )}
    </div>
  );
}
