import { PHASES, type Phase, type ProjectSummary } from "../../../../core/types";
import { cx } from "../../cx";
import { SECTION_META } from "../../sections";

/** アーカイブでの絞り込み（all: すべて / active: 未アーカイブ / archived: アーカイブ済み） */
export type ArchiveFilter = "all" | "active" | "archived";

/** 保存の形式は、2 択だったころのまま（"1" = すべて、"0"・未保存 = 未アーカイブ）。アーカイブ済みだけは "archived" */
export const decodeArchiveFilter = (raw: string | null): ArchiveFilter => (raw === "1" ? "all" : raw === "archived" ? "archived" : "active");
export const encodeArchiveFilter = (value: ArchiveFilter): string => (value === "all" ? "1" : value === "archived" ? "archived" : "0");

/** カンバンの絞り込み（全プロジェクトのボードではプロジェクト、どのボードでもセクションとアーカイブ） */
export function KanbanFilters({
  projects,
  projectFilter,
  onProjectFilter,
  section,
  onSection,
  archive,
  onArchive,
}: {
  /** プロジェクトで絞り込めるとき（全プロジェクトのボードで 2 つ以上あるとき）だけ渡す */
  projects?: ProjectSummary[];
  projectFilter: number | "all";
  onProjectFilter: (value: number | "all") => void;
  section: Phase | "all";
  onSection: (value: Phase | "all") => void;
  archive: ArchiveFilter;
  onArchive: (value: ArchiveFilter) => void;
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
      <select
        className={cx("board-filter", section !== "all" && "filtered")}
        aria-label="セクションで絞り込み"
        value={section}
        onChange={(e) => onSection(e.target.value as Phase | "all")}
      >
        <option value="all">すべてのセクション</option>
        {PHASES.map((p) => (
          <option key={p} value={p}>
            {SECTION_META[p].label}
          </option>
        ))}
      </select>
      {/* 未アーカイブ（いつもの表示）以外を選んでいるときは、絞り込み中の色にする */}
      <select
        className={cx("board-filter", archive !== "active" && "filtered")}
        aria-label="アーカイブで絞り込み"
        value={archive}
        onChange={(e) => onArchive(e.target.value as ArchiveFilter)}
      >
        <option value="all">すべてのチャット</option>
        <option value="active">未アーカイブ</option>
        <option value="archived">アーカイブ済み</option>
      </select>
    </>
  );
}
