import type { CSSProperties, Ref } from "react";
import { boardColumnOf } from "../../../core/board";
import { BOARD_COLUMN_LABELS, type AgentState, type Run } from "../../../core/types";
import { chatTitle } from "../chatTitle";
import { cx } from "../cx";
import { useProjects } from "../projectsContext";
import { COUNTED_COLUMNS } from "../runState";
import { shortRelativeTime } from "../time";
import { COLUMN_TONE } from "./board/tones";
import { PopoverHeader } from "./PopoverHeader";
import { StatusDot } from "./StatusDot";

type CountedColumn = (typeof COUNTED_COLUMNS)[number];

/** 状態ごとのチャットのまとまり（作業中 → 回答待ち → 未読の順。中は最近動いた順） */
export interface StateRunsSection {
  column: CountedColumn;
  runs: Run[];
}

/**
 * チャットを状態ごとに分ける（アーカイブしたものと既読は入れない。チャットのないまとまりは出さない）。
 * 数え方はカンバンの列と同じ（boardColumnOf）で、状態ごとの数（stateCounts）とそろう
 */
export function runsByState(runs: readonly Run[], stateOf: (run: Run) => AgentState): StateRunsSection[] {
  const byColumn = new Map<CountedColumn, Run[]>(COUNTED_COLUMNS.map((c) => [c, []]));
  for (const run of runs) {
    if (run.archived_at) continue;
    byColumn.get(boardColumnOf(stateOf(run)) as CountedColumn)?.push(run);
  }
  return COUNTED_COLUMNS.map((column) => ({ column, runs: byColumn.get(column)!.sort((a, b) => b.active_at.localeCompare(a.active_at)) })).filter(
    (s) => s.runs.length > 0,
  );
}

/**
 * 状態ごとにまとめたチャットの一覧（見出しの下に「作業中」「回答待ち」「未読」と、それぞれのチャット）。
 * 画面の見出しの状態ごとの数（StateStats）と、右のパネルのタブのまとまりの名前の札で共通。行を押すと onOpen。
 * showProject なら行にプロジェクト名も出す（いくつかのプロジェクトのチャットが混ざるとき）
 */
export function StateRunsPopover({
  title,
  sections,
  showProject = false,
  onOpen,
  onClose,
  className,
  style,
  popoverRef,
}: {
  title: string;
  sections: StateRunsSection[];
  showProject?: boolean;
  onOpen: (run: Run) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
  popoverRef?: Ref<HTMLDivElement>;
}) {
  const { projectName } = useProjects();
  return (
    <div ref={popoverRef} className={cx("state-runs-popover", className)} style={style} role="dialog" aria-label={title}>
      <PopoverHeader title={title} onClose={onClose} />
      {sections.length === 0 && <p className="state-runs-empty muted">作業中・回答待ち・未読のチャットはありません</p>}
      {sections.map(({ column, runs }) => (
        <section key={column} className="state-runs-section">
          <h3 className="state-runs-head">
            <StatusDot color={COLUMN_TONE[column]} />
            {BOARD_COLUMN_LABELS[column]}
            <span className="muted">{runs.length}</span>
          </h3>
          {runs.map((run) => (
            <button
              key={run.id}
              type="button"
              className="state-runs-row"
              onClick={() => {
                onClose();
                onOpen(run);
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
  );
}
