import { cx } from "@/foundation/ui/lib/cx";
import type { ArchiveFilter } from "./archiveFilter";

/** ボードの見出しの絞り込みの選択欄（絞り込んでいるときだけ緑の枠） */
function FilterSelect<V extends string>({ label, value, filtered, onChange, options }: { label: string; value: V; filtered: boolean; onChange: (value: V) => void; options: { value: V; label: string; title?: string }[] }) {
  return (
    <select className={cx("board-filter", filtered && "filtered")} aria-label={label} value={value} onChange={(e) => onChange(e.target.value as V)}>
      {options.map((o) => (
        <option key={o.value} value={o.value} title={o.title}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * カンバンの絞り込み（アーカイブ・作業場所。プロジェクトは見出しの名前から切り替える）。
 * アーカイブの絞り込み中の色は、アーカイブ済みだけに絞っているときだけ（「すべて」は何も隠していないので付けない。未アーカイブはふだんの表示）
 */
export function KanbanFilters({
  archive,
  onArchive,
  worktrees,
  worktree,
  onWorktree,
}: {
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
      <FilterSelect
        label="アーカイブで絞り込み"
        value={archive}
        filtered={archive === "archived"}
        onChange={onArchive}
        options={[
          { value: "all", label: "すべてのチャット" },
          { value: "active", label: "未アーカイブ" },
          { value: "archived", label: "アーカイブ済み" },
        ]}
      />
      {worktrees.length > 0 && (
        <FilterSelect
          label="作業場所で絞り込み"
          value={worktree}
          filtered={worktree !== "all"}
          onChange={onWorktree}
          options={[{ value: "all", label: "すべての作業場所" }, { value: "", label: "本体" }, ...worktrees.map((w) => ({ value: w.path, label: w.label, title: w.path }))]}
        />
      )}
    </>
  );
}
