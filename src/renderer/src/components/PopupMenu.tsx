import { createContext, useContext, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "../cx";
import { useDismiss } from "../hooks/useDismiss";
import { useMenuKeys } from "../hooks/useMenuKeys";

/** メニューが画面の端からはみ出さないよう寄せた位置（width・height はおおよそのメニューの大きさ） */
export function clampToViewport(x: number, y: number, width: number, height: number) {
  return { x: Math.min(x, window.innerWidth - width), y: Math.min(y, window.innerHeight - height) };
}

interface Props {
  x: number;
  y: number;
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
 * 右クリック・「…」で開くメニュー。外側のクリック・Esc で閉じる。開いたら先頭の項目にピントを置き、↑↓ で項目を移る（useMenuKeys）。
 * サイドバーの横スライド（transform）の中から開いても位置がずれないよう、body の直下に出す
 */
export function PopupMenu({ x, y, className, label, escape = "stop", ignore, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, { escape, ignore });
  useMenuKeys(ref);
  return createPortal(
    <MenuCloseContext.Provider value={onClose}>
      <div ref={ref} className={className ? `menu ${className}` : "menu"} style={{ left: x, top: y }} role="menu" aria-label={label}>
        {children}
      </div>
    </MenuCloseContext.Provider>,
    document.body,
  );
}

/** いちばん近い PopupMenu を閉じる（MenuItem が押されたときに使う） */
const MenuCloseContext = createContext<() => void>(() => {});

/**
 * メニューの 1 項目。押すと、メニューを閉じてから onSelect を行う（閉じるのは PopupMenu から受け取る）。
 * role は選択肢なら menuitemradio / menuitemcheckbox（checked を付ける）。danger は削除などの赤い項目
 */
export function MenuItem({
  role = "menuitem",
  checked,
  danger,
  className,
  title,
  onSelect,
  children,
}: {
  role?: "menuitem" | "menuitemradio" | "menuitemcheckbox";
  checked?: boolean;
  danger?: boolean;
  className?: string;
  title?: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  const close = useContext(MenuCloseContext);
  return (
    <button
      role={role}
      aria-checked={checked}
      className={cx(className, danger && "danger") || undefined}
      title={title}
      onClick={() => {
        close();
        onSelect();
      }}
    >
      {children}
    </button>
  );
}
