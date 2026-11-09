import { Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { MAX_TAG_LENGTH, UNTAGGED } from "@shared/project/tags";
import { cx } from "@/lib/cx";
import { isRenameKey } from "@/lib/keys";
import { useProjects } from "@/stores/projects";
import { tagLabel, useProjectTagFilter } from "@/features/project/projectTagFilter";
import { deleteTag, renameTag } from "@/features/project/tagActions";
import { IconButton } from "@/ui/IconButton";
import { InlineName } from "@/ui/InlineName";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { useViewTabDrag } from "@/ui/useViewTabDrag";

/**
 * 見出しの 3 行目「タグ」: 使っているタグを小さなボタンで並べ、押すたびにそのタグでの絞り込みを付け外しする（複数選べ、選んだタグのどれかが付いているプロジェクトを出す。「タグなし」も選べる）。
 * タグはドラッグで並べ替え（並びはプロジェクトの右クリックのタグにも効く）、右クリックで名前の変更・削除、ピントがあるときの Enter で名前の変更（ビューのタブ・チャットの行と同じ。
 * 名前の変更・削除は付いているすべてのプロジェクトに効く。「タグなし」は動かせず、名前も変えられない）。
 * どのプロジェクトにもタグがなければ行ごと出さない（見出しの 1・2 行目のボタンを増やさず、狭いサイドバーでも文字を残すため）。
 * 値はサイドバー・全プロジェクトの画面・⌘⇧A・プロジェクトの切り替えで共通（useProjectTagFilter）
 */
export function TagFilterRow() {
  const filter = useProjectTagFilter();
  const { projects } = useProjects();
  const [renaming, setRenaming] = useState<string>();
  const menu = useContextMenu<string>();
  const drag = useViewTabDrag(
    filter.tags.map((t) => ({ id: t, name: t, state: null })),
    filter.move,
    "tag-filter-pill",
  );
  if (filter.tags.length === 0) return null;

  const pill = (tag: string) => {
    const on = filter.selected.includes(tag);
    const real = tag !== UNTAGGED;
    return (
      <button
        key={tag || "untagged"}
        type="button"
        className={cx("tag-filter-pill", on && "on", !real && "untagged", real && drag.tabClass(tag))}
        aria-pressed={on}
        title={
          on
            ? `「${tagLabel(tag)}」での絞り込みを外す`
            : `「${tagLabel(tag)}」のプロジェクトだけを出す（ほかのタグと一緒に選べます${real ? "。ドラッグで並べ替え・右クリックで名前の変更・削除" : ""}）`
        }
        onClick={() => filter.toggle(tag)}
        {...(real && {
          ...drag.tabProps(tag),
          onContextMenu: (e) => menu.open(e, tag),
          onKeyDown: (e) => {
            // Enter で名前を変える（押すのは Space）
            if (!isRenameKey(e)) return;
            e.preventDefault();
            setRenaming(tag);
          },
        })}
      >
        {tagLabel(tag)}
      </button>
    );
  };

  return (
    <div className="project-list-row tag-filter-row" role="group" aria-label="タグで絞り込む">
      <span className="project-list-row-label">タグ</span>
      <div className="tag-filter-pills">
        {filter.tags.map((tag) =>
          renaming === tag ? (
            <span key={tag} className="tag-filter-rename">
              <InlineName
                className="tag-filter-name"
                maxLength={MAX_TAG_LENGTH}
                initial={tag}
                onSubmit={(name) => {
                  setRenaming(undefined);
                  void renameTag(projects, tag, name);
                }}
                onCancel={() => setRenaming(undefined)}
              />
            </span>
          ) : (
            pill(tag)
          ),
        )}
        {pill(UNTAGGED)}
        {filter.active && <IconButton icon={X} size={12} label="タグの絞り込みを外す" className="tag-filter-clear" onClick={filter.clear} />}
      </div>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={`タグ「${menu.menu.value}」`} onClose={menu.close}>
          <MenuItem title="Enter でも変えられます" onSelect={() => setRenaming(menu.menu?.value)}>
            <Pencil size={14} aria-hidden /> 名前を変更
          </MenuItem>
          <MenuItem danger onSelect={() => menu.menu && void deleteTag(projects, menu.menu.value)}>
            <Trash2 size={14} aria-hidden /> 削除…
          </MenuItem>
        </PopupMenu>
      )}
    </div>
  );
}
