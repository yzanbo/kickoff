import type { ReactNode, Ref } from "react";
import { cx } from "@/foundation/ui/lib/cx";

/** 画面の位置（左上。px） */
export interface FloatPoint {
  x: number;
  y: number;
}

/** 選んだ範囲（画面の位置）の上に、幅 width の箱を出す位置（画面の端からはみ出さないように寄せる） */
export function placeAbove(rect: { left: number; top: number; width: number }, width: number): FloatPoint {
  return {
    x: Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8)),
    y: Math.max(8, rect.top - 38),
  };
}

/**
 * 選んだ文の近くに浮かせるボタンの箱（会話・ノート・差分・ファイル・Docker のログ・ターミナルで同じ見た目）。中のボタンは `btn selection-attach-button`。
 * 押してもピントが移って選択が消えないよう、ボタンは onMouseDown で既定の動きを止める
 */
export function SelectionBox({ at, className, ref, children }: { at: FloatPoint; className?: string; ref?: Ref<HTMLDivElement>; children: ReactNode }) {
  return (
    <div ref={ref} className={cx("selection-attach floating", className)} style={{ left: at.x, top: at.y }}>
      {children}
    </div>
  );
}
