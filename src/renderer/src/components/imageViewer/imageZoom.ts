/** 画像の大きさ・画面の大きさ（px） */
export interface Size {
  width: number;
  height: number;
}

/** 表示の状態: 倍率（1 = 実寸）と、画面の中央からのずれ（px） */
export interface View {
  scale: number;
  x: number;
  y: number;
}

/** ボタン・キーでの 1 回の倍率 */
export const ZOOM_STEP = 1.25;
/** 倍率の上限 */
const MAX_SCALE = 8;
/** 倍率の下限（画面に合わせた大きさがこれより小さければ、そこまで） */
const MIN_SCALE = 0.25;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 画面に合わせた倍率（画面に収まる大きさ。小さな画像は引き伸ばさず実寸のまま） */
export function fitScale(natural: Size, stage: Size): number {
  if (natural.width <= 0 || natural.height <= 0 || stage.width <= 0 || stage.height <= 0) return 1;
  return Math.min(1, stage.width / natural.width, stage.height / natural.height);
}

/** 画面に合わせた表示 */
export function fitView(natural: Size, stage: Size): View {
  return { scale: fitScale(natural, stage), x: 0, y: 0 };
}

/** ずれを、画像が画面の外へ逃げない範囲に収める（画面より小さい向きは中央に置く） */
export function clampView(view: View, natural: Size, stage: Size): View {
  const maxX = Math.max(0, (natural.width * view.scale - stage.width) / 2);
  const maxY = Math.max(0, (natural.height * view.scale - stage.height) / 2);
  // -0 は 0 にそろえる
  return { scale: view.scale, x: clamp(view.x, -maxX, maxX) || 0, y: clamp(view.y, -maxY, maxY) || 0 };
}

/** 倍率を scale に変える。point（画面の中央からの位置）の下にある画像の点は動かさない */
export function zoomTo(view: View, scale: number, point: { x: number; y: number }, natural: Size, stage: Size): View {
  const next = clamp(scale, Math.min(MIN_SCALE, fitScale(natural, stage)), MAX_SCALE);
  const ratio = next / view.scale;
  return clampView({ scale: next, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }, natural, stage);
}

/** ずらす（ドラッグ・2 本指のスクロール） */
export function panBy(view: View, dx: number, dy: number, natural: Size, stage: Size): View {
  return clampView({ scale: view.scale, x: view.x + dx, y: view.y + dy }, natural, stage);
}

/** 画像が画面からはみ出していて、ずらせるか */
export function canPan(view: View, natural: Size, stage: Size): boolean {
  return natural.width * view.scale > stage.width + 0.5 || natural.height * view.scale > stage.height + 0.5;
}
