// 浮かぶもの（右クリック・「…」・▾ のメニュー、押すと開く一覧）を、画面の中に収まる位置に置く計算

/** 画面の端から空ける幅（px） */
const VIEWPORT_MARGIN = 8;

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
export type FloatingSide = "below" | "above" | "right" | "left";
/** 基準の要素のどちらの端にそろえるか（上下に出すなら start = 左端 / end = 右端、左右に出すなら start = 上端 / end = 下端。center は真ん中） */
export type FloatingAlign = "start" | "end" | "center";

/**
 * 置く場所。
 * - 点（右クリックの位置）: 左上をそこに置き、入らなければ左・上へ寄せる
 * - 基準の要素（開いたボタンなど）: その下（side: above なら上・right なら右・left なら左）に gap だけ離し、align の端をそろえる
 */
export type Placement = { x: number; y: number } | { anchor: Box; side?: FloatingSide; align?: FloatingAlign; gap?: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/**
 * 基準の要素の片側（before = 上・左 / after = 下・右）に置く位置: side の側に入れば side、入らなければ反対側、
 * どちらにも入らなければ広い方（はみ出した分は呼ぶ側が画面の中へ寄せる）
 */
function placeOnAxis(before: number, after: number, size: number, gap: number, limit: number, margin: number, preferAfter: boolean): number {
  const atAfter = after + gap;
  const atBefore = before - gap - size;
  const fitsAfter = atAfter + size <= limit - margin;
  const fitsBefore = atBefore >= margin;
  const roomAfter = limit - margin - atAfter;
  const roomBefore = before - gap - margin;
  const useAfter = preferAfter ? fitsAfter || (!fitsBefore && roomAfter >= roomBefore) : !fitsBefore && (fitsAfter || roomAfter > roomBefore);
  return useAfter ? atAfter : atBefore;
}

/** 基準の要素の端（start・end）か真ん中にそろえた位置 */
function alignOnAxis(start: number, end: number, size: number, align: FloatingAlign): number {
  return align === "start" ? start : align === "end" ? end - size : start + (end - start) / 2 - size / 2;
}

/**
 * 浮かぶもの（大きさ size）の左上の位置。画面（viewport）の端から margin は空け、入りきらなければ上・左の端にそろえる。
 * 基準の要素の side の側に入らなければ反対側に出し、どちらにも入らなければ広い方に出して画面の中へ寄せる
 */
export function placeFloating(at: Placement, size: Size, viewport: Size, margin = VIEWPORT_MARGIN): { left: number; top: number } {
  const maxLeft = viewport.width - size.width - margin;
  const maxTop = viewport.height - size.height - margin;
  if ("x" in at) return { left: clamp(at.x, margin, maxLeft), top: clamp(at.y, margin, maxTop) };
  const { anchor, side = "below", align = "start", gap = 4 } = at;
  const vertical = side === "below" || side === "above";
  const left = vertical
    ? alignOnAxis(anchor.left, anchor.right, size.width, align)
    : placeOnAxis(anchor.left, anchor.right, size.width, gap, viewport.width, margin, side === "right");
  const top = vertical
    ? placeOnAxis(anchor.top, anchor.bottom, size.height, gap, viewport.height, margin, side === "below")
    : alignOnAxis(anchor.top, anchor.bottom, size.height, align);
  return { left: clamp(left, margin, maxLeft), top: clamp(top, margin, maxTop) };
}

/** 要素の下（上）に出す置き場所（開いたときの位置で決める。メニューを開くボタンなど） */
export function anchorPlacement(element: Element, options: { side?: FloatingSide; align?: FloatingAlign; gap?: number } = {}): Placement {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { anchor: { left, top, right, bottom }, ...options };
}
