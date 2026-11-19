import type { CSSProperties, ReactNode } from "react";
import { useProgressiveRows } from "@/foundation/ui/hooks/useProgressiveRows";

/**
 * 段階に分けて描く一覧（hooks/useProgressiveRows.ts）で、まだ描いていない行の場所を取る空の箱。高さは省いた行の数 × 行の見積もり
 * （CSS の --progressive-row。一覧ごとに `styles/` で決める）。残りを足したときにスクロールバーのつまみが動かないように。
 * as: 一覧の中に置ける要素（ul の中なら li）
 */
export function ProgressiveSpacer({ omitted, as: Tag = "div" }: { omitted: number; as?: "div" | "li" }) {
  if (omitted <= 0) return null;
  return <Tag aria-hidden className="progressive-spacer" style={{ "--progressive-omitted": omitted } as CSSProperties} />;
}

/** 段階に分けて描く一覧の行（カード）: 配られた上限の数だけ頭から描き、残りの場所は空の箱で取る（ボードの列・リスト・フィード） */
export function ProgressiveItems<T>({ items, render }: { items: readonly T[]; render: (item: T) => ReactNode }) {
  const { shown, omitted } = useProgressiveRows(items);
  return (
    <>
      {shown.map(render)}
      <ProgressiveSpacer omitted={omitted} />
    </>
  );
}
