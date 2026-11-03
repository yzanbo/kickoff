import { useRef, useState, type CSSProperties } from "react";
import { boardColumnOf } from "../../../../core/board";
import { BOARD_COLUMN_LABELS, type Run } from "../../../../core/types";
import { useRunStates } from "../../approvalsContext";
import { chatTitle } from "../../chatTitle";
import { useDismiss } from "../../hooks/useDismiss";
import { useProjects } from "../../projectsContext";
import { openRun } from "../../router";
import { COUNTED_COLUMNS } from "../../runState";
import { shortRelativeTime } from "../../time";
import { COLUMN_TONE } from "../board/tones";
import { PopoverHeader } from "../PopoverHeader";
import { StatusDot } from "../StatusDot";

type CountedColumn = (typeof COUNTED_COLUMNS)[number];

/**
 * 画面の見出しの、状態ごとのチャット数（作業中・回答待ち・未読。0 のものは出さない）。
 * 数え方・並び・色はサイドバーのプロジェクトの数（HeadCounts）とカンバンの列にそろえる。
 * 押すと、状態ごとにまとめたチャットの一覧を開き、行を押すとそのチャットを開く。showProject なら行にプロジェクト名も出す（全プロジェクトの画面）
 */
export function StateStats({ runs, showProject = false }: { runs: Run[]; showProject?: boolean }) {
  const { stateOf } = useRunStates();
  const { projectName } = useProjects();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), { enabled: open });

  // 状態ごとのチャット（アーカイブしたものと既読は数えない。最近動いた順）
  const byColumn = new Map<CountedColumn, Run[]>(COUNTED_COLUMNS.map((c) => [c, []]));
  for (const run of runs) {
    if (run.archived_at) continue;
    byColumn.get(boardColumnOf(stateOf(run)) as CountedColumn)?.push(run);
  }
  for (const list of byColumn.values()) list.sort((a, b) => b.active_at.localeCompare(a.active_at));
  const shown = COUNTED_COLUMNS.filter((c) => byColumn.get(c)!.length > 0);
  if (shown.length === 0) return null;

  return (
    <div ref={ref} className="state-stats">
      <button type="button" className="state-stats-button" aria-expanded={open} title="状態ごとのチャットを一覧する" onClick={() => setOpen(!open)}>
        {shown.map((c) => (
          <span key={c} className="stat stat-state" style={{ "--tone": COLUMN_TONE[c] } as CSSProperties}>
            {BOARD_COLUMN_LABELS[c]} {byColumn.get(c)!.length}
          </span>
        ))}
      </button>
      {open && (
        <div className="state-runs-popover" role="dialog" aria-label="状態ごとのチャット">
          <PopoverHeader title="状態ごとのチャット" onClose={() => setOpen(false)} />
          {shown.map((c) => (
            <section key={c} className="state-runs-section">
              <h3 className="state-runs-head">
                <StatusDot color={COLUMN_TONE[c]} />
                {BOARD_COLUMN_LABELS[c]}
                <span className="muted">{byColumn.get(c)!.length}</span>
              </h3>
              {byColumn.get(c)!.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  className="state-runs-row"
                  onClick={() => {
                    setOpen(false);
                    openRun(run.project_id, run.id);
                  }}
                >
                  <span className="state-runs-title">{chatTitle(run.title)}</span>
                  {showProject && <span className="state-runs-project muted">{projectName(run.project_id)}</span>}
                  <span className="state-runs-time muted">{shortRelativeTime(run.active_at)}</span>
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
