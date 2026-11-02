import { useRef, useState } from "react";
import type { GitCommit } from "../../../../core/types";
import { cx } from "../../cx";
import { startVerticalDrag } from "../../hooks/dragResize";
import { useStoredNumber } from "../../hooks/useStoredState";
import { HISTORY_SPLIT_KEY } from "../../storageKeys";
import { CommitTable } from "./CommitTable";
import { CommitView } from "./CommitView";
import type { GitLogController } from "./useGitLog";

/** 上のコミットの表の高さ（割合。下はコミットの詳細） */
const DEFAULT_SPLIT = 43;

/** 履歴の右側（Fork と同じ: 上にコミットの表、下に選んだコミットの詳細。境目はドラッグで動かせる） */
export function HistoryMain({
  projectId,
  log,
  commit,
  onSelect,
}: {
  projectId: number;
  log: GitLogController;
  commit?: GitCommit;
  onSelect: (commit: GitCommit) => void;
}) {
  const [split, setSplit] = useStoredNumber(HISTORY_SPLIT_KEY, DEFAULT_SPLIT);
  const [resizing, setResizing] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const main = mainRef.current;
    const table = tableRef.current;
    if (!main || !table) return;
    const box = main.getBoundingClientRect();
    let next = split;
    setResizing(true);
    startVerticalDrag(e, {
      // ドラッグ中は描き直さず、高さだけを書き換えて指に追従させる
      move: (clientY) => {
        next = Math.round(Math.max(15, Math.min(85, ((clientY - box.top) / box.height) * 100)));
        table.style.flexBasis = `${next}%`;
      },
      end: () => {
        setResizing(false);
        setSplit(next);
      },
    });
  };

  return (
    <div ref={mainRef} className={cx("history-main", resizing && "resizing")}>
      <div ref={tableRef} className="history-table" style={{ flexBasis: `${split}%` }}>
        <CommitTable log={log} selected={commit?.hash} onSelect={onSelect} />
      </div>
      <div
        className="history-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="コミットの表の高さを変える"
        title="ドラッグで高さを変える（ダブルクリックで元に戻す）"
        onPointerDown={startResize}
        onDoubleClick={() => setSplit(DEFAULT_SPLIT)}
      />
      <div className="history-detail">
        {commit ? (
          <CommitView projectId={projectId} commit={commit} />
        ) : (
          <p className="muted small changes-hint">コミットを選ぶと、変わったファイルと差分を表示します。</p>
        )}
      </div>
    </div>
  );
}
