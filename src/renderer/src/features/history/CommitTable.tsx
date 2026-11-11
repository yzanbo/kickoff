import { useEffect, useRef, type MouseEvent } from "react";
import type { GitCommit } from "@shared/types";
import { cx } from "@/lib/cx";
import { formatDayTime } from "@/lib/time";
import type { GraphRow } from "./commitGraph";
import { laneColor } from "./laneColors";
import { RefBadges } from "./CommitRefBadges";
import type { RefTarget } from "./refTarget";
import type { GitLogController } from "./useGitLog";

/** グラフの 1 列の幅と、1 行の高さ（px） */
const LANE = 12;
const ROW = 26;
/** 列が多くても、グラフの幅はここまで（はみ出た線は切る） */
const MAX_LANES = 12;
const x = (lane: number) => lane * LANE + LANE / 2;

/** 2 点を結ぶ線（列が変わるところは、なめらかに曲げる） */
function edgePath(from: number, to: number, y1: number, y2: number) {
  if (from === to) return `M ${x(from)} ${y1} L ${x(to)} ${y2}`;
  const mid = (y1 + y2) / 2;
  return `M ${x(from)} ${y1} C ${x(from)} ${mid}, ${x(to)} ${mid}, ${x(to)} ${y2}`;
}

/** 1 行分のグラフ（上半分・下半分の線と、コミットの点。マージは中を抜いた点） */
function GraphCell({ row, lanes, merge }: { row: GraphRow; lanes: number; merge: boolean }) {
  const width = Math.min(lanes, MAX_LANES) * LANE;
  return (
    <svg className="graph-cell" width={width} height={ROW} aria-hidden>
      {row.top.map((e, i) => (
        <path key={`t${i}`} d={edgePath(e.from, e.to, 0, ROW / 2)} stroke={laneColor(e.color)} />
      ))}
      {row.bottom.map((e, i) => (
        <path key={`b${i}`} d={edgePath(e.from, e.to, ROW / 2, ROW)} stroke={laneColor(e.color)} />
      ))}
      <circle cx={x(row.col)} cy={ROW / 2} r={4} stroke={laneColor(row.color)} fill={merge ? "var(--bg)" : laneColor(row.color)} />
    </svg>
  );
}

/** コミットの表（列: 線つきの件名・作者・コミットの番号・日時）。選んだ行が見えるようにスクロールする */
export function CommitTable({
  log,
  selected,
  onSelect,
  onRefMenu,
}: {
  log: GitLogController;
  selected?: string;
  onSelect: (commit: GitCommit) => void;
  /** 札の右クリック（ブランチ・タグのメニュー） */
  onRefMenu?: (e: MouseEvent, target: RefTarget) => void;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!log.commits) return <p className="muted small changes-empty">読み込み中…</p>;
  if (log.commits.length === 0) return <p className="muted small changes-empty">まだコミットがありません。</p>;
  return (
    <ul className="history-list" aria-label="コミット">
      {log.commits.map((commit, i) => {
        const isSelected = selected === commit.hash;
        return (
          <li key={commit.hash}>
            <button
              ref={isSelected ? selectedRef : undefined}
              className={cx("history-row", isSelected && "selected")}
              aria-current={isSelected || undefined}
              title={commit.subject}
              onClick={() => onSelect(commit)}
            >
              <GraphCell row={log.graph.rows[i]} lanes={log.graph.lanes} merge={commit.parents.length > 1} />
              <span className="history-subject">
                <RefBadges refs={commit.refs} known={log.refs} color={laneColor(log.graph.rows[i].color)} onMenu={onRefMenu} />
                {commit.subject}
              </span>
              <span className="history-author" title={commit.email}>
                {commit.author}
              </span>
              <span className="history-hash">{commit.hash.slice(0, 7)}</span>
              <span className="history-date" title={new Date(commit.date).toLocaleString("ja-JP")}>
                {formatDayTime(commit.date)}
              </span>
            </button>
          </li>
        );
      })}
      {log.more && (
        <li>
          <button className="history-more" disabled={log.loadingMore} onClick={() => void log.loadMore()}>
            {log.loadingMore ? "読み込み中…" : "さらに読み込む"}
          </button>
        </li>
      )}
    </ul>
  );
}
