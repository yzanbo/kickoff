import { cx } from "@/lib/cx";
import type { ArchiveFilter } from "./archiveFilter";

/**
 * ボードの見出しの、アーカイブでの絞り込み（すべてのボードで共通）。
 * 絞り込み中の色（緑の枠）は、アーカイブ済みだけに絞っているときだけ（「すべて」は何も隠していないので付けない。未アーカイブはふだんの表示）
 */
export function ArchiveFilterSelect({ value, onChange }: { value: ArchiveFilter; onChange: (value: ArchiveFilter) => void }) {
  return (
    <select
      className={cx("board-filter", value === "archived" && "filtered")}
      aria-label="アーカイブで絞り込み"
      value={value}
      onChange={(e) => onChange(e.target.value as ArchiveFilter)}
    >
      <option value="all">すべてのチャット</option>
      <option value="active">未アーカイブ</option>
      <option value="archived">アーカイブ済み</option>
    </select>
  );
}
