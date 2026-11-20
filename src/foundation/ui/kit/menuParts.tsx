// メニューの小さな部品（組の間の線・空の項目・押すと下に開くボタン・出す項目を選ぶチェックの一覧）
import { createElement, Fragment, type ReactNode } from "react";
import type { FloatingAlign } from "@/foundation/ui/lib/floating";
import { MenuItem, PopupMenu } from "./PopupMenu";
import { useContextMenu } from "./useContextMenu";

/** メニューの組の間の線 */
export const MenuSeparator = () => <div className="menu-separator" role="separator" />;

/** 描かない項目（条件で出さない項目の false・null・undefined） */
const isHidden = (node: ReactNode) => node === null || node === undefined || node === false;

/** 項目の組を並べ、空の組（出す項目がない組）を外して、組の間に線を入れる */
export function menuGroups(groups: readonly (readonly ReactNode[])[]): ReactNode[] {
  return groups
    .map((group) => group.filter((node) => !isHidden(node)))
    .filter((group) => group.length > 0)
    .map((group, i) => createElement(Fragment, { key: i }, i > 0 ? <MenuSeparator /> : null, ...group));
}

/** 押せない項目（「読み込み中…」「ありません」など） */
export function MenuEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="menu-label" role="menuitem" aria-disabled="true">
      {children}
    </div>
  );
}

/**
 * 押すと下にメニューを開くボタン（もう一度押すと閉じる）。items はメニューの中身（閉じる関数を受ける）。
 * ボタンには aria-haspopup と aria-expanded を付ける。className は開くボタンの見分けにも使う（外側のクリックとして閉じない）
 */
export function MenuButton({
  className,
  title,
  menuLabel,
  align,
  items,
  children,
}: {
  className: string;
  title?: string;
  menuLabel: string;
  align?: FloatingAlign;
  items: (close: () => void) => ReactNode;
  children: ReactNode;
}) {
  const menu = useContextMenu({ align });
  return (
    <>
      <button type="button" className={className} title={title} aria-haspopup="menu" aria-expanded={menu.isOpen} onClick={(e) => menu.toggle(e, undefined)}>
        {children}
      </button>
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label={menuLabel} ignore={`.${className.split(" ")[0]}`} onClose={menu.close}>
          {items(menu.close)}
        </PopupMenu>
      )}
    </>
  );
}

/** 出す項目を選ぶチェックの一覧（メニューの中に置く。押しても閉じず、続けて切り替えられる） */
export function FieldPicker<K extends string>({ fields, labels, shown, onToggle }: { fields: readonly K[]; labels: Record<K, string>; shown: readonly K[]; onToggle: (field: K) => void }) {
  return fields.map((field) => (
    <MenuItem key={field} checked={shown.includes(field)} keepOpen onSelect={() => onToggle(field)}>
      {labels[field]}
    </MenuItem>
  ));
}
