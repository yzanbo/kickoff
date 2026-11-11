import { useRef, type MouseEvent } from "react";
import type { GitCommit } from "@shared/types";
import { cx } from "@/lib/cx";
import { useDragSize } from "@/hooks/useDragSize";
import { HISTORY_SPLIT } from "@/lib/storageKeys";
import { usePageFind } from "@/ui/usePageFind";
import { CommitTable } from "./CommitTable";
import { CommitView } from "./CommitView";
import { laneColor } from "./laneColors";
import type { GitLogController } from "./useGitLog";
import type { RefTarget } from "./refTarget";

/** 履歴の右側（上にコミットの表、下に選んだコミットの詳細。境目はドラッグで動かせる）。⌘F は、下の詳細（変わったファイル・差分）の中を探す */
export function HistoryMain({
  projectId,
  log,
  commit,
  onSelect,
  onRefMenu,
}: {
  projectId: number;
  log: GitLogController;
  commit?: GitCommit;
  onSelect: (commit: GitCommit) => void;
  onRefMenu: (e: MouseEvent, target: RefTarget) => void;
}) {
  // 上のコミットの表の高さ（全体の高さに対する割合 %。下はコミットの詳細）。ドラッグ中は描き直さず、高さだけを書き換えて指に追従させる
  const split = useDragSize<HTMLDivElement>({ setting: HISTORY_SPLIT, axis: "y", unit: "%", min: 15, max: 85, write: "flexBasis" });

  const detailRef = useRef<HTMLDivElement>(null);
  // 表に読み込んであるコミット（親を押したとき選ぶ）と、その行の線の色（詳細の札も同じ色で塗る）
  const findCommit = (hash: string) => log.commits?.find((c) => c.hash === hash);
  const refColorOf = (hash: string) => {
    const index = log.commits?.findIndex((c) => c.hash === hash) ?? -1;
    return laneColor(index >= 0 ? (log.graph.rows[index]?.color ?? 0) : 0);
  };
  const find = usePageFind(detailRef, { placeholder: "このコミットを検索", className: "page-find", enabled: Boolean(commit) });

  return (
    <div className={cx("history-main", split.resizing && "resizing")}>
      <div ref={split.paneRef} className="history-table" style={{ flexBasis: `${split.size}%` }}>
        <CommitTable log={log} selected={commit?.hash} onSelect={onSelect} onRefMenu={onRefMenu} />
      </div>
      <div className="history-resizer" aria-label="コミットの表の高さを変える" {...split.handle} />
      <div ref={detailRef} className="history-detail">
        {find}
        {commit ? (
          <CommitView
            projectId={projectId}
            commit={commit}
            known={log.refs}
            refColor={refColorOf(commit.hash)}
            canPick={(hash) => Boolean(findCommit(hash))}
            onPick={(hash) => {
              const found = findCommit(hash);
              if (found) onSelect(found);
            }}
            onRefMenu={onRefMenu}
          />
        ) : (
          <p className="muted small changes-hint">コミットを選ぶと、変わったファイルと差分を表示します。</p>
        )}
      </div>
    </div>
  );
}
