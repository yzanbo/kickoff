import { Archive, Check, ChevronsDownUp, ChevronsUpDown, Clock, GalleryHorizontal, GripVertical, Rows3, type LucideIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useMenuKeys } from "../../hooks/useMenuKeys";
import type { ProjectOrder } from "../../projectOrder";
import { IconButton } from "../IconButton";
import { clampToViewport, PopupMenu } from "../PopupMenu";
import { ChatGroupingMenu } from "./ChatGroupingMenu";
import { HeadChip } from "./HeadChip";

/** slide: 1 プロジェクトずつ横にスライド / stack: すべてのプロジェクトを縦に並べる */
export type NavLayout = "slide" | "stack";

const LAYOUTS: { value: NavLayout; label: string; icon: LucideIcon }[] = [
  { value: "stack", label: "縦に並べる（すべてのプロジェクト）", icon: Rows3 },
  { value: "slide", label: "1 つずつ横にスライド", icon: GalleryHorizontal },
];

const ORDERS: { value: ProjectOrder; label: string; icon: LucideIcon }[] = [
  { value: "manual", label: "手動（ドラッグで並べ替え）", icon: GripVertical },
  { value: "recent", label: "最近動いた順", icon: Clock },
];

interface Props {
  layout: NavLayout;
  onLayout: (layout: NavLayout) => void;
  order: ProjectOrder;
  onOrder: (order: ProjectOrder) => void;
  /** 縦並びのとき: すべてのプロジェクトのチャット一覧をまとめて閉じる・開く */
  fold?: { allCollapsed: boolean; set: (collapsed: boolean) => void };
  /** しまった（アーカイブした）プロジェクトの数（0 なら出す・隠すの項目を置かない） */
  archivedCount: number;
  showArchived: boolean;
  onShowArchived: (show: boolean) => void;
}

/**
 * プロジェクト一覧の上の見出しの行。何に効くかを文字で出したボタンから選ぶ:
 * 「プロジェクト」（並べ方・並び順・アーカイブしたプロジェクトを出すか）/「チャット」（すべてのプロジェクトのチャットの並べ方・表示）。
 * 右端は、縦並びのときの「すべて閉じる / 開く」（VS Code のエクスプローラーの見出しと同じ位置）。
 * アイコンだけのボタンを並べない（何をするものか分からないため）
 */
export function ProjectListHead({ fold, ...props }: Props) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const current = LAYOUTS.find((l) => l.value === props.layout)!;
  const order = ORDERS.find((o) => o.value === props.order)!;
  return (
    <div className="project-list-head">
      <HeadChip
        icon={current.icon}
        label="プロジェクト"
        title={`プロジェクトの並べ方・並び順（いまは「${current.label}」「${order.label}」）`}
        className="project-view-button"
        open={at !== null}
        onClick={(e) => {
          if (at) return setAt(null);
          const r = e.currentTarget.getBoundingClientRect();
          setAt(clampToViewport(r.left, r.bottom + 4, 260, 260));
        }}
      />
      <ChatGroupingMenu />
      {/* 開いているものがあれば閉じる、すべて閉じていれば開く */}
      {fold && (
        <IconButton
          icon={fold.allCollapsed ? ChevronsUpDown : ChevronsDownUp}
          className="project-list-fold"
          label={fold.allCollapsed ? "すべてのプロジェクトを開く" : "すべてのプロジェクトを閉じる"}
          title={fold.allCollapsed ? "すべて開く" : "すべて閉じる"}
          onClick={() => fold.set(!fold.allCollapsed)}
        />
      )}
      {at && <ProjectViewMenu {...at} {...props} onClose={() => setAt(null)} />}
    </div>
  );
}

function ProjectViewMenu({
  x,
  y,
  layout,
  onLayout,
  order,
  onOrder,
  archivedCount,
  showArchived,
  onShowArchived,
  onClose,
}: Omit<Props, "fold"> & { x: number; y: number; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  useMenuKeys(menuRef);
  const choice = (key: string, role: "menuitemradio" | "menuitemcheckbox", icon: LucideIcon, label: ReactNode, checked: boolean, run: () => void) => {
    const Icon = icon;
    return (
      <button
        key={key}
        role={role}
        aria-checked={checked}
        onClick={() => {
          onClose();
          run();
        }}
      >
        <Icon size={14} aria-hidden />
        <span className="project-switch-item">{label}</span>
        {checked && <Check size={14} aria-hidden />}
      </button>
    );
  };
  return (
    <PopupMenu x={x} y={y} label="プロジェクトの表示" ignore=".project-view-button" menuRef={menuRef} onClose={onClose}>
      <div className="menu-label">並べ方</div>
      {LAYOUTS.map((l) => choice(l.value, "menuitemradio", l.icon, l.label, l.value === layout, () => onLayout(l.value)))}
      <div className="menu-separator" role="separator" />
      <div className="menu-label">並び順（固定したものは上）</div>
      {ORDERS.map((o) => choice(o.value, "menuitemradio", o.icon, o.label, o.value === order, () => onOrder(o.value)))}
      {archivedCount > 0 && (
        <>
          <div className="menu-separator" role="separator" />
          {choice("archived", "menuitemcheckbox", Archive, `アーカイブしたプロジェクトを表示（${archivedCount}）`, showArchived, () => onShowArchived(!showArchived))}
        </>
      )}
    </PopupMenu>
  );
}
