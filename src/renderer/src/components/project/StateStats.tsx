import { useRef, useState, type CSSProperties } from "react";
import { BOARD_COLUMN_LABELS, type Run } from "../../../../core/types";
import { useRunStates } from "../../approvalsContext";
import { useDismiss } from "../../hooks/useDismiss";
import { openRun } from "../../router";
import { COLUMN_TONE } from "../board/tones";
import { StateRunsPopover, runsByState } from "../StateRunsPopover";

/**
 * 画面の見出しの、状態ごとのチャット数（作業中・回答待ち・未読。0 のものは出さない）。
 * 数え方・並び・色はサイドバーのプロジェクトの数（HeadCounts）とカンバンの列にそろえる。
 * 押すと、状態ごとにまとめたチャットの一覧（StateRunsPopover）を開き、行を押すとそのチャットを開く。showProject なら行にプロジェクト名も出す（全プロジェクトの画面）
 */
export function StateStats({ runs, showProject = false }: { runs: Run[]; showProject?: boolean }) {
  const { stateOf } = useRunStates();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), { enabled: open });

  const sections = runsByState(runs, stateOf);
  if (sections.length === 0) return null;

  return (
    <div ref={ref} className="state-stats">
      <button type="button" className="state-stats-button" aria-expanded={open} title="状態ごとのチャットを一覧する" onClick={() => setOpen(!open)}>
        {sections.map(({ column, runs: list }) => (
          <span key={column} className="stat stat-state" style={{ "--tone": COLUMN_TONE[column] } as CSSProperties}>
            {BOARD_COLUMN_LABELS[column]} {list.length}
          </span>
        ))}
      </button>
      {open && (
        <StateRunsPopover
          title="状態ごとのチャット"
          sections={sections}
          showProject={showProject}
          onOpen={(run) => openRun(run.project_id, run.id)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
