import type { CSSProperties, ReactNode, RefObject } from "react";
import { useModalDialog } from "@/foundation/ui/hooks/useModalDialog";
import { cx } from "@/foundation/ui/lib/cx";
import { useOverlayOpen } from "./overlayCount";

/**
 * ダイアログの骨組み（開いたらすぐモーダルで出す <dialog>）。題名・中身・ボタンの行（actions）を .app-dialog-body に並べ、
 * onSubmit があれば中身を <form> にする（Enter で決める）。Esc・背景を押す（closeOnBackdrop）・close() で閉じると onClose
 */
export function Dialog({
  title,
  label,
  className,
  size,
  closeOnBackdrop = true,
  focusSelf = false,
  dialogRef,
  onClose,
  onSubmit,
  actions,
  children,
}: {
  title?: ReactNode;
  /** 読み上げの名前（題名がないとき） */
  label?: string;
  /** "dialog app-dialog" に足すクラス */
  className?: string;
  /** 幅（px。省けば 420px。狭いウィンドウでは左右に 16px ずつ空けて縮む） */
  size?: number;
  closeOnBackdrop?: boolean;
  /** 開いた直後にダイアログそのものにピントを置く（最初のボタンに枠が出ないように） */
  focusSelf?: boolean;
  /** <dialog> の要素（閉じる・中の要素にピントを置くとき） */
  dialogRef?: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  onSubmit?: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { ref, backdropProps } = useModalDialog({ closeOnBackdrop, focusSelf, ref: dialogRef });
  useOverlayOpen(true);
  const body = (
    <>
      {title !== undefined && <h2 className="app-dialog-title">{title}</h2>}
      {children}
      {actions}
    </>
  );
  return (
    <dialog
      ref={ref}
      className={cx("dialog floating app-dialog", className)}
      style={size === undefined ? undefined : ({ "--dialog-w": `${size}px` } as CSSProperties)}
      aria-label={label}
      onClose={onClose}
      {...backdropProps}
    >
      {onSubmit ? (
        <form
          className="app-dialog-body"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {body}
        </form>
      ) : (
        <div className="app-dialog-body">{body}</div>
      )}
    </dialog>
  );
}
