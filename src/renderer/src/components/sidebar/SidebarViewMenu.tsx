import { Archive, Check, ChevronsDownUp, ChevronsUpDown, GalleryHorizontal, Rows3, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useMenuKeys } from "../../hooks/useMenuKeys";
import { IconButton } from "../IconButton";
import { clampToViewport, PopupMenu } from "../PopupMenu";

/** slide: 1 プロジェクトずつ横にスライド / stack: すべてのプロジェクトを縦に並べる */
export type NavLayout = "slide" | "stack";

const LAYOUTS: { value: NavLayout; label: string; icon: LucideIcon }[] = [
  { value: "slide", label: "1 プロジェクトずつ横にスライド", icon: GalleryHorizontal },
  { value: "stack", label: "すべてのプロジェクトを縦に並べる", icon: Rows3 },
];

/**
 * サイドバーの下の行の右端の「表示」ボタン。たまにしか変えないもの（プロジェクトの並べ方・すべて閉じる / 開く・アーカイブしたプロジェクトを出すか）を
 * メニューにまとめ、下の行を「主な操作 ＋ このボタン」の 1 行に保つ（狭くても折り返さない）
 */
export function SidebarViewMenu(props: ViewProps) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <IconButton
        icon={SlidersHorizontal}
        label="サイドバーの表示"
        title="サイドバーの表示（並べ方・すべて閉じる / 開く・アーカイブしたプロジェクト）"
        className="sidebar-view-button"
        aria-haspopup="menu"
        aria-expanded={at !== null}
        onClick={(e) => {
          if (at) return setAt(null);
          const r = e.currentTarget.getBoundingClientRect();
          // 下の行から開くので、ボタンの上に出す
          setAt(clampToViewport(r.right - 260, r.top - 4 - MENU_HEIGHT, 260, MENU_HEIGHT));
        }}
      />
      {at && <ViewMenu {...at} {...props} onClose={() => setAt(null)} />}
    </>
  );
}

const MENU_HEIGHT = 230;

interface ViewProps {
  layout: NavLayout;
  onLayout: (layout: NavLayout) => void;
  /** 縦並びのとき: すべてのプロジェクトのチャット一覧をまとめて閉じる・開く */
  fold?: { allCollapsed: boolean; allOpen: boolean; set: (collapsed: boolean) => void };
  /** しまった（アーカイブした）プロジェクトの数（0 なら出す・隠すの項目を置かない） */
  archivedCount: number;
  showArchived: boolean;
  onShowArchived: (show: boolean) => void;
}

function ViewMenu({
  x,
  y,
  layout,
  onLayout,
  fold,
  archivedCount,
  showArchived,
  onShowArchived,
  onClose,
}: ViewProps & { x: number; y: number; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  useMenuKeys(menuRef);
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <PopupMenu x={x} y={y} label="サイドバーの表示" ignore=".sidebar-view-button" menuRef={menuRef} onClose={onClose}>
      <div className="menu-label">プロジェクトの並べ方</div>
      {LAYOUTS.map(({ value, label, icon: Icon }) => (
        <button key={value} role="menuitemradio" aria-checked={layout === value} onClick={pick(() => onLayout(value))}>
          <Icon size={14} aria-hidden />
          <span className="project-switch-item">{label}</span>
          {layout === value && <Check size={14} aria-hidden />}
        </button>
      ))}
      {(fold || archivedCount > 0) && <div className="menu-separator" role="separator" />}
      {fold && (
        <>
          <button role="menuitem" disabled={fold.allCollapsed} onClick={pick(() => fold.set(true))}>
            <ChevronsDownUp size={14} aria-hidden /> すべてのプロジェクトを閉じる
          </button>
          <button role="menuitem" disabled={fold.allOpen} onClick={pick(() => fold.set(false))}>
            <ChevronsUpDown size={14} aria-hidden /> すべてのプロジェクトを開く
          </button>
        </>
      )}
      {archivedCount > 0 && (
        <button role="menuitemcheckbox" aria-checked={showArchived} onClick={pick(() => onShowArchived(!showArchived))}>
          <Archive size={14} aria-hidden />
          <span className="project-switch-item">アーカイブしたプロジェクトを表示（{archivedCount}）</span>
          {showArchived && <Check size={14} aria-hidden />}
        </button>
      )}
    </PopupMenu>
  );
}
