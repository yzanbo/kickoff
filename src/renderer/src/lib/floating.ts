// 浮かぶもの（右クリック・「…」・▾ のメニュー、押すと開く一覧）を、画面の中に収まる位置に置く計算

/** 画面の端から空ける幅（px） */
export const VIEWPORT_MARGIN = 8;

export interface Size {
  width: number;
  height: number;
}

/** 基準の要素の画面の中の位置（getBoundingClientRect の値） */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 基準の要素のどちら側に出すか（入らなければ反対側） */
export type FloatingSide = "below" | "above";
/** 基準の要素のどちらの端にそろえるか（start = 左端 / end = 右端） */
export type FloatingAlign = "start" | "end";

/**
 * 置く場所。
 * - 点（右クリックの位置）: 左上をそこに置き、入らなければ左・上へ寄せる
 * - 基準の要素（開いたボタンなど）: その下（side: above なら上）に gap だけ離し、左端（align: end なら右端）をそろえる
 */
export type Placement = { x: number; y: number } | { anchor: Box; side?: FloatingSide; align?: FloatingAlign; gap?: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/**
 * 浮かぶもの（大きさ size）の左上の位置。画面（viewport）の端から margin は空け、入りきらなければ上・左の端にそろえる。
 * 基準の要素の下（上）に入らなければ反対側に出し、どちらにも入らなければ広い方に出して画面の中へ寄せる
 */
export function placeFloating(at: Placement, size: Size, viewport: Size, margin = VIEWPORT_MARGIN): { left: number; top: number } {
  const maxLeft = viewport.width - size.width - margin;
  const maxTop = viewport.height - size.height - margin;
  if ("x" in at) return { left: clamp(at.x, margin, maxLeft), top: clamp(at.y, margin, maxTop) };
  const { anchor, side = "below", align = "start", gap = 4 } = at;
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - size.height;
  const fitsBelow = below <= maxTop;
  const fitsAbove = above >= margin;
  const roomBelow = viewport.height - margin - below;
  const roomAbove = anchor.top - gap - margin;
  const useBelow = side === "below" ? fitsBelow || (!fitsAbove && roomBelow >= roomAbove) : !fitsAbove && (fitsBelow || roomBelow > roomAbove);
  const left = align === "start" ? anchor.left : anchor.right - size.width;
  return { left: clamp(left, margin, maxLeft), top: clamp(useBelow ? below : above, margin, maxTop) };
}

/** 要素の下（上）に出す置き場所（開いたときの位置で決める。メニューを開くボタンなど） */
export function anchorPlacement(element: Element, options: { side?: FloatingSide; align?: FloatingAlign; gap?: number } = {}): Placement {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { anchor: { left, top, right, bottom }, ...options };
}
