import { createContext, useContext, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/foundation/ui/lib/cx";
import type { Placement } from "@/foundation/ui/lib/floating";
import { useDismiss } from "@/foundation/ui/hooks/useDismiss";
import { useFloating } from "@/foundation/ui/hooks/useFloating";
import { useRovingList } from "./list/useRovingList";

interface Props {
  /** 置く場所（右クリックの位置、または開いたボタンの下。useContextMenu が決める）。描いてから大きさを測って画面の中に収める */
  at: Placement;
  /** "menu" に加えるクラス */
  className?: string;
  label?: string;
  /** Esc の扱い（useDismiss と同じ。既定は、重なったいちばん上のメニューだけ閉じる） */
  escape?: "stop" | "pass";
  /** 開くボタンのセレクタ。押しても外側として閉じず、ボタンの側で開閉する（開いているときに押したら閉じる） */
  ignore?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 右クリック・「…」で開くメニュー。外側のクリック・Esc で閉じる。開いたらメニューそのものにピントを置き、↑↓ で項目を移る（useRovingList の focus。↓ で先頭・↑ で最後から）。
 * 開いたあとに自分の大きさを測って画面の中に収め、中身の大きさが変わったら置き直す（呼ぶ側で大きさを見積もらない）。
 * top layer に出すので、ポップオーバー・ダイアログの中から開いても上に出る。サイドバーの横スライド（transform）の中から開いても
 * 位置がずれず、文字の大きさなども開いた場所に影響されないよう、body の直下に出す
 */
export function PopupMenu({ at, className, label, escape = "stop", ignore, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, { escape, ignore });
  useRovingList({ mode: "focus", ref, global: true, focusSelf: true, items: menuItems });
  useFloating(ref, () => at);
  return createPortal(
    <MenuCloseContext.Provider value={onClose}>
      <div ref={ref} popover="manual" className={cx("menu", className)} role="menu" aria-label={label}>
        {children}
      </div>
    </MenuCloseContext.Provider>,
    document.body,
  );
}

/**
 * ↑↓ で移る項目（メニューのボタン）。メニューの中に横に開く一覧（data-menu-scope の付いた要素）があれば、
 * ピントのある側の項目の中だけで動く
 */
function menuItems(root: HTMLElement, active: Element | null): HTMLElement[] {
  const scopeOf = (el: Element) => {
    const inner = el.closest<HTMLElement>("[data-menu-scope]");
    return inner && root.contains(inner) ? inner : root;
  };
  const scope = active && root.contains(active) ? scopeOf(active) : root;
  return [...scope.querySelectorAll<HTMLElement>("button")].filter((b) => scopeOf(b) === scope);
}

/** いちばん近い PopupMenu を閉じる（MenuItem が押されたときに使う） */
const MenuCloseContext = createContext<() => void>(() => {});

/**
 * メニューの 1 項目。押すと、メニューを閉じてから onSelect を行う（閉じるのは PopupMenu から受け取る）。
 * role は選択肢なら menuitemradio / menuitemcheckbox（checked を付ける）。danger は削除などの赤い項目。
 * keepOpen はメニューを閉じない（子のメニューのチェックを続けて切り替えるとき）。disabled は押せない項目（理由は title に）
 */
export function MenuItem({
  role = "menuitem",
  checked,
  danger,
  className,
  title,
  keepOpen,
  disabled,
  onSelect,
  buttonProps,
  children,
}: {
  role?: "menuitem" | "menuitemradio" | "menuitemcheckbox";
  checked?: boolean;
  danger?: boolean;
  className?: string;
  title?: string;
  keepOpen?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  /** ボタンに足す属性（ドラッグで並べ替える項目の draggable・ドラッグの知らせ・data- など） */
  buttonProps?: ButtonHTMLAttributes<HTMLButtonElement> & Record<`data-${string}`, string>;
  children: ReactNode;
}) {
  const close = useContext(MenuCloseContext);
  return (
    <button
      {...buttonProps}
      role={role}
      aria-checked={checked}
      className={cx(className, danger && "danger") || undefined}
      title={title}
      disabled={disabled}
      onClick={() => {
        if (!keepOpen) close();
        onSelect();
      }}
    >
      {children}
    </button>
  );
}
