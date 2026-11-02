import { cx } from "../../cx";
import type { ArchiveFilter } from "./archiveFilter";

/** ボードの見出しの、アーカイブでの絞り込み（カンバンとグループのボードで共通。未アーカイブ以外を選んでいるときは絞り込み中の色） */
export function ArchiveFilterSelect({ value, onChange }: { value: ArchiveFilter; onChange: (value: ArchiveFilter) => void }) {
  return (
    <select
      className={cx("board-filter", value !== "active" && "filtered")}
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
