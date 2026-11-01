import type { GitCommit } from "../../../../core/types";
import { cx } from "../../cx";
import { relativeTime } from "../../time";
import { ErrorText } from "../ErrorText";
import { RefreshButton } from "../IconButton";
import type { GraphRow } from "./commitGraph";
import type { GitLogController } from "./useGitLog";

/** グラフの 1 列の幅と、1 行の高さ（px） */
const LANE = 12;
const ROW = 26;
/** 列が多くても、グラフの幅はここまで（はみ出た線は切る） */
const MAX_LANES = 12;
/** ブランチの線の色（列ごとに順に使う） */
const PALETTE = ["var(--info)", "var(--sec-implementation)", "var(--sec-testing)", "var(--sec-schedule)", "var(--sec-deployment)", "var(--warn)", "var(--ok)", "var(--ng)"];
const colorOf = (n: number) => PALETTE[n % PALETTE.length];
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
        <path key={`t${i}`} d={edgePath(e.from, e.to, 0, ROW / 2)} stroke={colorOf(e.color)} />
      ))}
      {row.bottom.map((e, i) => (
        <path key={`b${i}`} d={edgePath(e.from, e.to, ROW / 2, ROW)} stroke={colorOf(e.color)} />
      ))}
      <circle cx={x(row.col)} cy={ROW / 2} r={4} stroke={colorOf(row.color)} fill={merge ? "var(--bg-sidebar)" : colorOf(row.color)} />
    </svg>
  );
}

/** ブランチ・タグの印（"HEAD -> main" はいまのブランチ、"tag: v1" はタグ、"origin/…" はリモート） */
function RefBadges({ refs }: { refs: string[] }) {
  return (
    <>
      {refs.map((ref) => {
        const head = ref.startsWith("HEAD -> ");
        const tag = ref.startsWith("tag: ");
        const name = head ? ref.slice(8) : tag ? ref.slice(5) : ref;
        if (name === "HEAD" || name.endsWith("/HEAD")) return null;
        return (
          <span key={ref} className={cx("ref-badge", head && "head", tag && "tag", !head && !tag && name.includes("/") && "remote")} title={ref}>
            {name}
          </span>
        );
      })}
    </>
  );
}

/** 「変更」タブの履歴（Fork と同じく、ブランチの線つきでコミットを並べる。選ぶと右に詳しく出す） */
export function HistoryView({ log, selected, onSelect }: { log: GitLogController; selected?: string; onSelect: (commit: GitCommit) => void }) {
  return (
    <>
      <header className="changes-head">
        <span className="changes-branch">履歴</span>
        <span className="spacer" />
        <RefreshButton label="履歴を取り直す" busy={false} onClick={log.refresh} />
      </header>
      <ErrorText message={log.error} className="code-search-message" />
      {!log.commits ? (
        <p className="muted small changes-empty">読み込み中…</p>
      ) : log.commits.length === 0 ? (
        <p className="muted small changes-empty">まだコミットがありません。</p>
      ) : (
        <ul className="history-list" aria-label="コミット">
          {log.commits.map((commit, i) => (
            <li key={commit.hash}>
              <button
                className={cx("history-row", selected === commit.hash && "selected")}
                aria-current={selected === commit.hash || undefined}
                title={`${commit.subject}\n${commit.author}・${new Date(commit.date).toLocaleString("ja-JP")}\n${commit.hash.slice(0, 7)}`}
                onClick={() => onSelect(commit)}
              >
                <GraphCell row={log.graph.rows[i]} lanes={log.graph.lanes} merge={commit.parents.length > 1} />
                <span className="history-text">
                  <span className="history-subject">
                    <RefBadges refs={commit.refs} />
                    {commit.subject}
                  </span>
                  {/* 狭い一覧でも件名を広く見せるため、右は日時だけ（作者はマウスを乗せたときの説明に出す） */}
                  <span className="history-meta">{relativeTime(commit.date)}</span>
                </span>
              </button>
            </li>
          ))}
          {log.more && (
            <li>
              <button className="history-more" disabled={log.loadingMore} onClick={() => void log.loadMore()}>
                {log.loadingMore ? "読み込み中…" : "さらに読み込む"}
              </button>
            </li>
          )}
        </ul>
      )}
    </>
  );
}
