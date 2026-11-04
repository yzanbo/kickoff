import type { GitCommit } from "@shared/types";
import { cx } from "@/lib/cx";
import { useDragSize } from "@/hooks/useDragSize";
import { HISTORY_SPLIT } from "@/lib/storageKeys";
import { CommitTable } from "./CommitTable";
import { CommitView } from "./CommitView";
import type { GitLogController } from "./useGitLog";

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
  // 上のコミットの表の高さ（全体の高さに対する割合 %。下はコミットの詳細）。ドラッグ中は描き直さず、高さだけを書き換えて指に追従させる
  const split = useDragSize<HTMLDivElement>({ setting: HISTORY_SPLIT, axis: "y", unit: "%", min: 15, max: 85, write: "flexBasis" });

  return (
    <div className={cx("history-main", split.resizing && "resizing")}>
      <div ref={split.paneRef} className="history-table" style={{ flexBasis: `${split.size}%` }}>
        <CommitTable log={log} selected={commit?.hash} onSelect={onSelect} />
      </div>
      <div className="history-resizer" aria-label="コミットの表の高さを変える" {...split.handle} />
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
