// 重なりの数の店（メニュー・ポップオーバー・ダイアログ・トーストが開閉で数える。上に重なるものがあるかを知りたい所が購読する）
import { useEffect } from "react";
import { createCell } from "@/foundation/ui/store";

/** いま開いている重なりの数 */
export const overlayCount = createCell(0);

/** open の間、重なりの数に 1 を足す（閉じた・外したら戻す） */
export function useOverlayOpen(open: boolean) {
  useEffect(() => {
    if (!open) return;
    overlayCount.set((n) => n + 1);
    return () => overlayCount.set((n) => n - 1);
  }, [open]);
}
