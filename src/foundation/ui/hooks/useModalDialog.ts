import { useEffect, useEffectEvent, useRef, type MouseEvent, type RefObject } from "react";

/**
 * 開いたらすぐモーダルで出す <dialog>。Esc や close() で閉じると、<dialog> の onClose が呼ばれる。
 * closeOnBackdrop: 外側（背景）を押したら閉じる / focusSelf: 開いた直後にダイアログ自体にピントを置く（最初のボタンに枠が出ないように）/
 * ref: 呼ぶ側が持つ要素の ref を使う（ダイアログの骨組み Dialog の dialogRef）
 */
export function useModalDialog({ closeOnBackdrop = true, focusSelf = false, ref: given }: { closeOnBackdrop?: boolean; focusSelf?: boolean; ref?: RefObject<HTMLDialogElement | null> } = {}) {
  const own = useRef<HTMLDialogElement>(null);
  const ref = given ?? own;
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
