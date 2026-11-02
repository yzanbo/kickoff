import { PHASES, type Phase } from "../../../../core/types";
import { cx } from "../../cx";
import { SECTION_META } from "../../sections";

/** アーカイブでの絞り込み（all: すべて / active: 未アーカイブ / archived: アーカイブ済み） */
export type ArchiveFilter = "all" | "active" | "archived";

/** 保存の形式は、2 択だったころのまま（"1" = すべて、"0"・未保存 = 未アーカイブ）。アーカイブ済みだけは "archived" */
export const decodeArchiveFilter = (raw: string | null): ArchiveFilter => (raw === "1" ? "all" : raw === "archived" ? "archived" : "active");
export const encodeArchiveFilter = (value: ArchiveFilter): string => (value === "all" ? "1" : value === "archived" ? "archived" : "0");

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
  /** チャットの作業場所（ワークツリーのフォルダ）。ワークツリーで作業しているチャットがあるときだけ、絞り込みを出す */
  worktrees: string[];
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
      {worktrees.length > 0 && (
        <select
          className={cx("board-filter", worktree !== "all" && "filtered")}
          aria-label="作業場所で絞り込み"
          value={worktree}
          onChange={(e) => onWorktree(e.target.value)}
        >
          <option value="all">すべての作業場所</option>
          <option value="">本体</option>
          {worktrees.map((path) => (
            <option key={path} value={path}>
              {path.split("/").pop()}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
