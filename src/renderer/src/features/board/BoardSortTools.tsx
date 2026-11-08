import { ArrowDown, ArrowDownUp, ArrowUp, Check, Columns3 } from "lucide-react";
import { useSetting } from "@/hooks/useSetting";
import { BOARD_TABLE_HIDDEN } from "@/lib/storageKeys";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { CHAT_SORT_KEYS, CHAT_SORT_LABELS, nextChatSort, type ChatSort, type ChatSortKey } from "./chatSort";

/** そのボードで使う列（プロジェクトの列は全プロジェクトのボードだけ） */
const keysFor = (allProjects: boolean) => CHAT_SORT_KEYS.filter((k) => allProjects || k !== "project");

/**
 * 表に出す列（名前はいつも出す。隠した列はすべてのボードで共通に覚える）と、出し入れ toggle。
 * 並びは CHAT_SORT_KEYS の順
 */
export function useTableColumns(allProjects: boolean) {
  const [hidden, setHidden] = useSetting(BOARD_TABLE_HIDDEN);
  const columns = keysFor(allProjects).filter((k) => k === "title" || !hidden.includes(k));
  const toggle = (key: ChatSortKey) => setHidden(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]);
  return { columns, hidden, toggle };
}

/**
 * ツールバーの「並び順」（すべての表示で。表では見出しを押しても変えられる）。並べる列と向きを選ぶ。
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

/** ツールバーの「列」（表のときだけ）。表に出す列をチェックで出し入れする（メニューは閉じずに続けて選べる） */
export function TableColumnsButton({ allProjects }: { allProjects: boolean }) {
  const menu = useContextMenu();
  const { hidden, toggle } = useTableColumns(allProjects);
  return (
    <>
      <button
        type="button"
        className="btn btn-sm board-columns-button"
        aria-haspopup="menu"
        aria-expanded={menu.isOpen}
        aria-label="表に出す列"
        onClick={(e) => menu.toggle(e)}
      >
        <Columns3 size={13} aria-hidden />
        <span className="btn-label">列</span>
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="表に出す列" ignore=".board-columns-button" onClose={menu.close}>
          <div className="menu-label">表に出す列</div>
          {keysFor(allProjects)
            .filter((k) => k !== "title")
            .map((key) => {
              const shown = !hidden.includes(key);
              return (
                <MenuItem key={key} role="menuitemcheckbox" checked={shown} keepOpen onSelect={() => toggle(key)}>
                  <span className="project-switch-item">{CHAT_SORT_LABELS[key]}</span>
                  {shown && <Check size={14} aria-hidden />}
                </MenuItem>
              );
            })}
        </PopupMenu>
      )}
    </>
  );
}
