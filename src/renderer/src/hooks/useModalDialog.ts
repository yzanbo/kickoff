import { useEffect, useRef, type MouseEvent } from "react";

/**
 * 開いたらすぐモーダルで出す <dialog>。Esc や close() で閉じると、<dialog> の onClose が呼ばれる。
 * closeOnBackdrop: 外側（背景）を押したら閉じる / focusSelf: 開いた直後にダイアログ自体にピントを置く（最初のボタンに枠が出ないように）
 */
export function useModalDialog({ closeOnBackdrop = true, focusSelf = false } = {}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    if (focusSelf) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => ref.current?.close();
  return {
    ref,
    close,
    /** <dialog> に渡す（背景を押したら閉じる） */
    backdropProps: closeOnBackdrop ? { onClick: (e: MouseEvent<HTMLDialogElement>) => e.target === e.currentTarget && close() } : {},
  };
}
