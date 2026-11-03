import { X } from "lucide-react";
import { UNTAGGED } from "../../../../core/projectTags";
import { cx } from "../../cx";
import { tagLabel, useProjectTagFilter } from "../../projectTagFilter";
import { IconButton } from "../IconButton";

/**
 * 見出しの 3 行目「タグ」: 使っているタグを小さなボタンで並べ、押すたびにそのタグでの絞り込みを付け外しする（複数選べ、選んだタグのどれかが付いているプロジェクトを出す。「タグなし」も選べる）。
 * どのプロジェクトにもタグがなければ行ごと出さない（見出しの 1・2 行目のボタンを増やさず、狭いサイドバーでも文字を残すため）。
 * 値はサイドバー・全プロジェクトの画面・⌘⇧A・プロジェクトの切り替えで共通（useProjectTagFilter）
 */
export function TagFilterRow() {
  const filter = useProjectTagFilter();
  if (filter.tags.length === 0) return null;
  return (
    <div className="project-list-row tag-filter-row" role="group" aria-label="タグで絞り込む">
      <span className="project-list-row-label">タグ</span>
      <div className="tag-filter-pills">
        {[...filter.tags, UNTAGGED].map((tag) => {
          const on = filter.selected.includes(tag);
          return (
            <button
              key={tag || "untagged"}
              type="button"
              className={cx("tag-filter-pill", on && "on", tag === UNTAGGED && "untagged")}
              aria-pressed={on}
              title={on ? `「${tagLabel(tag)}」での絞り込みを外す` : `「${tagLabel(tag)}」のプロジェクトだけを出す（ほかのタグと一緒に選べます）`}
              onClick={() => filter.toggle(tag)}
            >
              {tagLabel(tag)}
            </button>
          );
        })}
        {filter.active && <IconButton icon={X} size={12} label="タグの絞り込みを外す" className="tag-filter-clear" onClick={filter.clear} />}
      </div>
    </div>
  );
}
