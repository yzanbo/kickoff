import { ChevronRight } from "lucide-react";
import { memo } from "react";
import { cx } from "@/lib/cx";
import { formatElapsed, formatFullStamp, formatStamp } from "@/lib/time";
import { Elapsed } from "@/features/chat/status/Elapsed";
import { callDuration } from "@/features/chat/tools/toolTimes";
import { describeTool } from "@/features/chat/tools/toolDescribe";
import { agentHueStyle } from "@/features/chat/subagents/agentHues";
import type { ActivityRow } from "./activityRows";
import type { RailRow } from "./activityRails";

/** 線の 1 列の幅（px。CSS の .activity-rails の列と同じ） */
const RAIL_COL = 14;

interface LineProps {
  row: ActivityRow;
  rail: RailRow;
  /** 線の欄の列の数（すべての行で同じ幅にそろえる） */
  width: number;
  /** 持ち主の名前（メイン・サブエージェントの説明） */
  name: string;
  hues: ReadonlyMap<string, number>;
  rel: (s: string) => string;
  expanded: boolean;
  onToggle: (key: string) => void;
  /** 会話のその場所へ移る（eventId を渡せば、まとめたツールのうちのその 1 回へ） */
  onOpen: (row: ActivityRow, eventId?: number) => void;
}

/**
 * 動きの 1 行: 時刻・線（メインの線から枝分かれするサブエージェントの線）・誰が・何を・かかった時間（実行中は回る印と経過）。
 * 押すと会話のその場所へ移る。いくつものツールをまとめた行は、左の矢印で 1 回ずつに広げる
 */
function ActivityLineView({ row, rail, width, name, hues, rel, expanded, onToggle, onOpen }: LineProps) {
  const expandable = row.kind === "tools" && (row.tools?.length ?? 0) > 1;
  return (
    <div className={cx("activity-row", `kind-${row.kind}`, row.agent === null && "main", row.running && "running", row.failed && "failed")} style={agentHueStyle(hueOf(hues, row.agent))}>
      <span className="activity-time" title={formatFullStamp(row.at)}>
        {formatStamp(row.at)}
      </span>
      <Rails rail={rail} width={width} hues={hues} />
      <div className="activity-body">
        <div className="activity-head">
          {expandable ? (
            <button type="button" className="activity-expand" aria-expanded={expanded} aria-label={expanded ? "まとめて表示" : "1 回ずつ表示"} onClick={() => onToggle(row.key)}>
              <ChevronRight size={13} className="tool-chevron" />
            </button>
          ) : (
            <span className="activity-expand-space" />
          )}
          <button type="button" className="activity-line" title="会話のこの場所へ移る" onClick={() => onOpen(row)}>
            <span className="activity-agent">{name}</span>
            <span className="activity-text">{rel(row.text)}</span>
            <Meta row={row} />
          </button>
        </div>
        {expandable && expanded && (
          <div className="activity-calls">
            {row.tools!.map((call) => {
              const ms = callDuration(call);
              return (
                <button key={call.use.id} type="button" className="activity-call" title="会話のこの場所へ移る" onClick={() => onOpen(row, call.use.id)}>
                  <span className="activity-call-time">{formatStamp(call.use.created_at)}</span>
                  <span className="activity-text">{rel(describeTool(call.use.data.name, (call.use.data.input ?? {}) as Record<string, unknown>))}</span>
                  <span className="activity-meta">{ms !== undefined ? formatElapsed(ms) : row.running ? <Elapsed since={call.use.created_at} /> : null}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** 行は中身が同じなら描き直さない（作業中は記録が届くたびに行の配列が作り直されるため） */
export const ActivityLine = memo(
  ActivityLineView,
  (a, b) =>
    a.row.key === b.row.key &&
    a.row.text === b.row.text &&
    a.row.running === b.row.running &&
    a.row.durationMs === b.row.durationMs &&
    a.row.tools?.length === b.row.tools?.length &&
    a.rail === b.rail &&
    a.width === b.width &&
    a.name === b.name &&
    a.hues === b.hues &&
    a.rel === b.rel &&
    a.expanded === b.expanded,
);

const hueOf = (hues: ReadonlyMap<string, number>, agent: string | null) => (agent === null ? undefined : hues.get(agent));

/** 右端: 実行中は回る印と経過、終わったものはかかった時間 */
function Meta({ row }: { row: ActivityRow }) {
  if (row.running)
    return (
      <span className="activity-meta">
        <span className="spinner small" aria-hidden />
        <Elapsed since={row.at} />
      </span>
    );
  return <span className="activity-meta">{row.durationMs !== undefined ? formatElapsed(row.durationMs) : null}</span>;
}

/** 線の欄（縦の線・起動で右へ分かれる線・節）。位置は列の番号から決め、色は持ち主の色（メインは灰色） */
function Rails({ rail, width, hues }: { rail: RailRow; width: number; hues: ReadonlyMap<string, number> }) {
  const x = (col: number) => col * RAIL_COL + RAIL_COL / 2;
  return (
    <span className="activity-rails" style={{ width: width * RAIL_COL }} aria-hidden>
      {rail.segments.map((s) => (
        <span
          key={s.col}
          className={cx("rail", s.agent === null && "main", s.from === "node" && "from-node", s.to === "node" && "to-node")}
          style={{ left: x(s.col), ...agentHueStyle(hueOf(hues, s.agent)) }}
        />
      ))}
      {rail.branch && (
        <span
          className="rail-branch"
          style={{ left: x(rail.branch.from), width: x(rail.branch.to) - x(rail.branch.from) + 1, ...agentHueStyle(hues.get(rail.branch.agent)) }}
        />
      )}
      <span className="rail-node" style={{ left: x(rail.col) }} />
    </span>
  );
}
