// 設定の「接続」の「再確認」の知らせ（節に欄を足した機能が、自分の様子を取り直す）
import { useEffect } from "react";
import { createSignal } from "@/foundation/ui/store";

const recheck = createSignal();

/** 「再確認」を押した */
export const emitConnectionRecheck = () => recheck.emit();

/** 「再確認」を押したら reload を呼ぶ（設定の「接続」の節に足した欄が使う） */
export function useConnectionRecheck(reload: () => void) {
  useEffect(() => recheck.subscribe(reload), [reload]);
}
