import { ArrowDown, ArrowDownUp, ArrowUp, Check } from "lucide-react";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { CHAT_SORT_KEYS, CHAT_SORT_LABELS, nextChatSort, type ChatSort } from "./chatSort";

/** そのボードで選べる並べ方（プロジェクトは全プロジェクトのボードだけ） */
const keysFor = (allProjects: boolean) => CHAT_SORT_KEYS.filter((k) => allProjects || k !== "project");

/**
 * ツールバーの「並び順」（すべての表示で）。並べる項目と向きを選ぶ。
 * 並び順はボード・リストの列・まとまりの中にも効く
 */
export function SortMenuButton({ sort, onSort, allProjects }: { sort: ChatSort; onSort: (sort: ChatSort) => void; allProjects: boolean }) {
  const menu = useContextMenu();
  const Arrow = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <>
      <button
        type="button"
        className="btn btn-sm board-sort-button"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        aria-label={`並び順: ${CHAT_SORT_LABELS[sort.key]}（${sort.dir === "asc" ? "昇順" : "降順"}）`}
        onClick={(e) => menu.toggle(e)}
      >
        <ArrowDownUp size={13} aria-hidden />
        <span className="btn-label">{CHAT_SORT_LABELS[sort.key]}</span>
        <Arrow size={12} aria-hidden />
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="並び順" ignore=".board-sort-button" onClose={menu.close}>
          <div className="menu-label">並び順（列・まとまりの中）</div>
          {keysFor(allProjects).map((key) => (
            <MenuItem key={key} role="menuitemradio" checked={sort.key === key} onSelect={() => onSort(sort.key === key ? sort : nextChatSort(sort, key))}>
              <span className="project-switch-item">{CHAT_SORT_LABELS[key]}</span>
              {sort.key === key && <Check size={14} aria-hidden />}
            </MenuItem>
          ))}
          <div className="menu-separator" role="separator" />
          {(["asc", "desc"] as const).map((dir) => (
            <MenuItem key={dir} role="menuitemradio" checked={sort.dir === dir} onSelect={() => onSort({ ...sort, dir })}>
              {dir === "asc" ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
              <span className="project-switch-item">{dir === "asc" ? "昇順" : "降順"}</span>
              {sort.dir === dir && <Check size={14} aria-hidden />}
            </MenuItem>
          ))}
        </PopupMenu>
      )}
    </>
  );
}
