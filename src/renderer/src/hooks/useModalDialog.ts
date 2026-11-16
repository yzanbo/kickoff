import { useEffect, useEffectEvent, useRef, type MouseEvent } from "react";

/**
 * 開いたらすぐモーダルで出す <dialog>。Esc や close() で閉じると、<dialog> の onClose が呼ばれる。
 * closeOnBackdrop: 外側（背景）を押したら閉じる / focusSelf: 開いた直後にダイアログ自体にピントを置く（最初のボタンに枠が出ないように）
 */
export function useModalDialog({ closeOnBackdrop = true, focusSelf = false } = {}) {
  const ref = useRef<HTMLDialogElement>(null);
  // 開くのは描いたときの 1 回だけ（focusSelf はそのときの値を読む）
  const open = useEffectEvent(() => {
    ref.current?.showModal();
    if (focusSelf) ref.current?.focus();
  });
  useEffect(() => {
    open();
  }, []);
  const close = () => ref.current?.close();
  return {
    ref,
    close,
    /** <dialog> に渡す（背景を押したら閉じる） */
    backdropProps: closeOnBackdrop ? { onClick: (e: MouseEvent<HTMLDialogElement>) => e.target === e.currentTarget && close() } : {},
  };
}
