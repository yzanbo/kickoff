/**
 * 画素で決める窓（hooks/useRowWindow）の純粋な計算: 前からの和・位置にある行・描く範囲・行の並びと箱・外してよい行・測った高さを受けるか・選択の間の行。
 * 行はふつうの流れ（flex の縦並び・gap）のまま描き、窓の外を高さだけの箱で置き換える（メモの仕様書「0023_表示を軽くする」の分冊 2 の 1-2）
 */

export interface RowMetrics {
  /** 行ごとの高さ（測った高さか見積もり。0 = 何も描かない行） */
  heights: Float64Array;
  /** 前からの和（offsets[i] = 行 i の上端。offsets[n] = 全体）。高さ 0 でない行の後ろに gap を 1 つずつ入れる */
  offsets: Float64Array;
  gap: number;
}

/** gap（px）を入れて、前からの和を作る（高さ 0 の行には gap を数えない。何も描かない行は場所を取らず、間隔も生まないため） */
export function buildMetrics(heights: ArrayLike<number>, gap: number): RowMetrics {
  const n = heights.length;
  const h = Float64Array.from(heights);
  const offsets = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + (h[i] > 0 ? h[i] + gap : 0);
  return { heights: h, offsets, gap };
}

/** 位置 y（流れの最初の行の上端から）にある行の番号（二分探索。範囲の外は端の行。行がなければ 0） */
export function indexAt(m: RowMetrics, y: number): number {
  const n = m.heights.length;
  if (n === 0) return 0;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (m.offsets[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** 描く範囲 [start, end)。見えている所（top〜top+height）に、上 overscanTop・下 overscanBottom を足す */
export function rangeFor(m: RowMetrics, view: { top: number; height: number }, overscanTop: number, overscanBottom: number): { start: number; end: number } {
  const n = m.heights.length;
  if (n === 0) return { start: 0, end: 0 };
  return { start: indexAt(m, view.top - overscanTop), end: Math.min(n, indexAt(m, view.top + view.height + overscanBottom) + 1) };
}

/**
 * 箱の高さ（箱の中の行の高さの合計と、その間の gap。箱そのものが流れの子として前後の gap を受けるので、その分を 1 つ引く）。
 * 中の行がすべて高さ 0 なら 0（その箱は置かない）
 */
export function boxHeight(m: RowMetrics, start: number, end: number): number {
  const sum = m.offsets[end] - m.offsets[start];
  return sum > 0 ? sum - m.gap : 0;
}

export type Run = { kind: "rows"; start: number; end: number } | { kind: "box"; start: number; end: number; height: number };

/** 描く行（mounted。番号）を、行の並びと箱の並びにする（離れた行の間も箱にする。高さ 0 の箱は置かない） */
export function runsOf(m: RowMetrics, mounted: ReadonlySet<number>): Run[] {
  const n = m.heights.length;
  const runs: Run[] = [];
  let i = 0;
  while (i < n) {
    const drawn = mounted.has(i);
    let j = i + 1;
    while (j < n && mounted.has(j) === drawn) j++;
    if (drawn) runs.push({ kind: "rows", start: i, end: j });
    else {
      const height = boxHeight(m, i, j);
      if (height > 0) runs.push({ kind: "box", start: i, end: j, height });
    }
    i = j;
  }
  return runs;
}

/**
 * 外してよい行の番号: 描く範囲（range）の外で、見えている所から far 以上離れ、idleMs 以上見ていない、残す印（keep）のない行
 * （行ったり来たりするスクロールで、描いて外してを繰り返さないため）
 */
export function releasable(args: {
  mounted: Iterable<number>;
  range: { start: number; end: number };
  m: RowMetrics;
  view: { top: number; height: number };
  far: number;
  now: number;
  lastSeen: (i: number) => number;
  idleMs: number;
  keep: (i: number) => boolean;
}): number[] {
  const { range, m, view, far, now, idleMs } = args;
  const out: number[] = [];
  for (const i of args.mounted) {
    if (i >= range.start && i < range.end) continue;
    const top = m.offsets[i];
    const bottom = m.offsets[i + 1];
    if (bottom > view.top - far && top < view.top + view.height + far) continue;
    if (now - args.lastSeen(i) < idleMs) continue;
    if (args.keep(i)) continue;
    out.push(i);
  }
  return out;
}

/** 測った大きさの差で、これより小さいものは覚え直さない（端数の行き来で描き直さない） */
const SIZE_EPSILON_PX = 0.5;

/**
 * 測った行の高さを覚えるか: 見えていない（0 × 0。隠したタブ）・前と 0.5px 未満の差・描くのを省いている間（content-visibility: auto で
 * 省かれている行は見積もり（--row-est）の大きさで並ぶので、それを測った高さとして覚えると、見積もりと補正が汚れる）は捨てる
 */
export function acceptRowSize({ skipped, prev, next }: { skipped: boolean; prev: number | undefined; next: { width: number; height: number } }): boolean {
  if (skipped) return false;
  if (next.width === 0 && next.height === 0) return false;
  return prev === undefined || Math.abs(prev - next.height) >= SIZE_EPSILON_PX;
}

/**
 * 選択の間の残す行 [start, end)。端の位置は行の番号（流れの前 = -1、後ろ = n 以上）。
 * 端の一方でも流れの行の中にあれば、端の行とその間の行を残す（外すと選んだ文の途中が箱になり、コピーで抜ける）。
 * 両端とも流れの外（⌘A で全体を選んだ・外から外へ選んだ）なら残さない（会話全体を描くと、数千行を一度に作って画面が止まる）
 */
export function keepRange(a: number, b: number, n: number): { start: number; end: number } | null {
  const inside = (x: number) => x >= 0 && x < n;
  if (!inside(a) && !inside(b)) return null;
  return { start: Math.max(0, Math.min(a, b)), end: Math.min(n, Math.max(a, b) + 1) };
}
