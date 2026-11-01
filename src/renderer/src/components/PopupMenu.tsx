import { useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "../hooks/useDismiss";

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
  /** メニューの要素を外から使うとき（ピントの移動など） */
  menuRef?: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 右クリック・「…」で開くメニュー。外側のクリック・Esc で閉じる。
 * サイドバーの横スライド（transform）の中から開いても位置がずれないよう、body の直下に出す
 */
export function PopupMenu({ x, y, className, label, escape = "stop", menuRef, onClose, children }: Props) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = menuRef ?? ownRef;
  useDismiss(ref, onClose, { escape });
  return createPortal(
    <div ref={ref} className={className ? `menu ${className}` : "menu"} style={{ left: x, top: y }} role="menu" aria-label={label}>
      {children}
    </div>,
    document.body,
  );
}
