import { PHASES, type Phase } from "../../../../core/types";
import { cx } from "../../cx";
import { SECTION_META } from "../../sections";
import type { ArchiveFilter } from "./archiveFilter";
import { ArchiveFilterSelect } from "./ArchiveFilterSelect";

/** カンバンの絞り込み（セクション・アーカイブ・作業場所。プロジェクトは見出しの名前から切り替える） */
export function KanbanFilters({
  section,
  onSection,
  archive,
  onArchive,
  worktrees,
  worktree,
  onWorktree,
}: {
  section: Phase | "all";
  onSection: (value: Phase | "all") => void;
  archive: ArchiveFilter;
  onArchive: (value: ArchiveFilter) => void;
  /** チャットの作業場所（ワークツリーのフォルダと、出す名前）。ワークツリーで作業しているチャットがあるときだけ、絞り込みを出す */
  worktrees: { path: string; label: string }[];
  /** "all" はすべて、"" は本体 */
  worktree: string;
  onWorktree: (value: string) => void;
}) {
  return (
    <>
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
      <ArchiveFilterSelect value={archive} onChange={onArchive} />
      {worktrees.length > 0 && (
        <select
          className={cx("board-filter", worktree !== "all" && "filtered")}
          aria-label="作業場所で絞り込み"
          value={worktree}
          onChange={(e) => onWorktree(e.target.value)}
        >
          <option value="all">すべての作業場所</option>
          <option value="">本体</option>
          {worktrees.map((w) => (
            <option key={w.path} value={w.path} title={w.path}>
              {w.label}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
