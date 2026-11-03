import { Tag } from "lucide-react";
import { tagLabel, type ProjectTagFilter } from "../projectTagFilter";
import { CloseButton } from "./IconButton";

/**
 * タグで絞り込んでいる印（全プロジェクトの画面の見出し・⌘⇧A の入力欄の横）。× で絞り込みを外す。
 * 絞り込んでいなければ何も出さない。filter は useProjectTagFilter の値（同じ画面で数え直しにも使うので、呼ぶ側から渡す）
 */
export function TagFilterNotice({ filter }: { filter: ProjectTagFilter }) {
  if (!filter.active) return null;
  const names = filter.selected.map(tagLabel).join("、");
  return (
    <span className="tag-filter-notice" title={`タグで絞り込み中: ${names}（サイドバーの見出しの「タグ」で選び直せます）`}>
      <Tag size={12} aria-hidden />
      <span className="tag-filter-notice-text">{names}</span>
      <CloseButton label="タグの絞り込みを外す" size={12} onClick={filter.clear} />
    </span>
  );
}
