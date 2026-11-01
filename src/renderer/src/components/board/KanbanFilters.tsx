import { PHASES, type Phase, type ProjectSummary } from "../../../../core/types";
import { cx } from "../../cx";
import { SECTION_META } from "../../sections";

/** カンバンの絞り込み（全プロジェクトのボードではプロジェクト、どのボードでもセクション） */
export function KanbanFilters({
  projects,
  projectFilter,
  onProjectFilter,
  section,
  onSection,
}: {
  /** プロジェクトで絞り込めるとき（全プロジェクトのボードで 2 つ以上あるとき）だけ渡す */
  projects?: ProjectSummary[];
  projectFilter: number | "all";
  onProjectFilter: (value: number | "all") => void;
  section: Phase | "all";
  onSection: (value: Phase | "all") => void;
}) {
  return (
    <>
      {projects && (
        <select
          className={cx("board-filter", projectFilter !== "all" && "filtered")}
          aria-label="プロジェクトで絞り込み"
          value={projectFilter}
          onChange={(e) => onProjectFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">すべてのプロジェクト</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <select className="board-filter" aria-label="セクションで絞り込み" value={section} onChange={(e) => onSection(e.target.value as Phase | "all")}>
        <option value="all">すべてのセクション</option>
        {PHASES.map((p) => (
          <option key={p} value={p}>
            {SECTION_META[p].label}
          </option>
        ))}
      </select>
    </>
  );
}
