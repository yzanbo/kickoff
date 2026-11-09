/**
 * ドラッグ中に、スクロールできる欄の端へ寄せたときの 1 フレームのスクロール量（app/dragAutoScroll.ts）。
 * 端から zone の内側に入ると動き始め、端に近いほど速い（いちばん端で maxStep。2 乗で、入ったばかりはゆっくり）。
 * pos は位置（縦なら clientY）、start / end は欄の端（縦なら上・下）。前へ戻すなら負、先へ進めるなら正、端の帯の外なら 0
 */
export function edgeScrollStep(pos: number, start: number, end: number, { zone = EDGE_ZONE_PX, maxStep = EDGE_MAX_STEP_PX } = {}): number {
  const size = end - start;
  if (size <= 0) return 0;
  // 小さな欄では帯を欄の 4 分の 1 までにする（上と下の帯が重なって、真ん中でも動き続けないように）
  const band = Math.min(zone, size / 4);
  if (band <= 0) return 0;
  const speed = (dist: number) => {
    const t = (band - Math.max(0, dist)) / band;
    return Math.max(1, Math.round(maxStep * t * t));
  };
  if (pos < start + band) return -speed(pos - start);
  if (pos > end - band) return speed(end - pos);
  return 0;
}

/** 端の帯の幅（px） */
export const EDGE_ZONE_PX = 48;
/** いちばん端での 1 フレームのスクロール量（px） */
export const EDGE_MAX_STEP_PX = 20;
