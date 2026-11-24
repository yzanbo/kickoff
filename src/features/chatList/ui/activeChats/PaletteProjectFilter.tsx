import { Archive } from "lucide-react";
import { cx } from "@/foundation/ui/lib/cx";
import { PillGroup } from "@/foundation/ui/kit/PillGroup";
import { cycleValue } from "@/foundation/ui/lib/cycleValue";
import { ProjectMark } from "@/features/projects/ui";

/** 絞り込むプロジェクト（"all" = すべて） */
export type ProjectFilterValue = number | "all";

export interface ProjectFilterOption {
  id: number;
  name: string;
  count: number;
  archived: boolean;
}

/**
 * ⌘⇧A の一覧をプロジェクトで絞り込む行: 「すべて」と、チャットのあるプロジェクトの切り替え（数を添える。サイドバーの並び）。
 * 右端にアーカイブ済みのプロジェクトを出すかの切り替え（アーカイブ済みのプロジェクトがあるときだけ）。入力欄の Tab / Shift+Tab でも順に切り替える
 */
export function PaletteProjectFilter({
  value,
  total,
  options,
  onChange,
  archivedCount,
  showArchived,
  onToggleArchived,
}: {
  value: ProjectFilterValue;
  total: number;
  options: ProjectFilterOption[];
  onChange: (value: ProjectFilterValue) => void;
  /** アーカイブ済みのプロジェクトの数（0 なら切り替えを出さない） */
  archivedCount: number;
  showArchived: boolean;
  onToggleArchived: () => void;
}) {
  return (
    <div className="palette-filters bar">
      <PillGroup<ProjectFilterValue>
        className="palette-projects"
        pillClassName="palette-project pill"
        label="プロジェクトで絞り込む（Tab / Shift+Tab で切り替え）"
        mode="single"
        selected={[value]}
        pills={[
          {
            key: "all",
            label: (
              <>
                すべて
                <span className="palette-project-count">{total}</span>
              </>
            ),
          },
          ...options.map((p) => ({
            key: p.id,
            className: p.archived ? "archived" : undefined,
            title: p.archived ? `${p.name}（アーカイブ済み）` : p.name,
            label: (
              <>
                <ProjectMark project={p} />
                <span className="palette-project-name">{p.name}</span>
                <span className="palette-project-count">{p.count}</span>
              </>
            ),
          })),
        ]}
        onChange={([next]) => onChange(next)}
      />
      {archivedCount > 0 && (
        <button
          type="button"
          className={cx("palette-archived-toggle pill", showArchived && "active")}
          aria-pressed={showArchived}
          title={showArchived ? "アーカイブ済みのプロジェクトのチャットを隠す" : `アーカイブ済みのプロジェクト（${archivedCount} 件）のチャットも出す`}
          onClick={onToggleArchived}
        >
          <Archive size={12} aria-hidden />
          アーカイブ済み
        </button>
      )}
    </div>
  );
}

/** Tab / Shift+Tab で、いまの絞り込みの次・前へ（端では反対の端へ回る） */
export function cycleProjectFilter(value: ProjectFilterValue, options: ProjectFilterOption[], back: boolean): ProjectFilterValue {
  return cycleValue<ProjectFilterValue>(["all", ...options.map((p) => p.id)], value, back ? -1 : 1);
}
