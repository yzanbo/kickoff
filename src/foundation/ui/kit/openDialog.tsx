// 部品の外から 1 つのダイアログを開く頼み（GitHub の新しい issue・マージの確認など。ノート・チャットの発言の右クリックからも開けるように）。
// 描くのは App と別ウィンドウに 1 つずつの DialogHost（AppShell が置く）。開き直したら前のものと替わる
import { Fragment, type ReactNode } from "react";
import { createCell, useCell } from "@/foundation/ui/store";

const current = createCell<{ key: number; render: (close: () => void) => ReactNode } | null>(null);
let seq = 0;
const close = () => current.set(null);

/** ダイアログを開く（render は閉じる関数を受けて描く。開くたびに作り直す） */
export function openDialog(render: (close: () => void) => ReactNode): void {
  current.set({ key: ++seq, render });
}

/** openDialog で開いたダイアログを描く所 */
export function DialogHost() {
  const open = useCell(current);
  return open ? <Fragment key={open.key}>{open.render(close)}</Fragment> : null;
}
