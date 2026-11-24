import { keepRange, type RowMetrics } from "./rowLayout";

/** 行の窓（useRowWindow）が DOM から読むもの: 行の包みの位置・読んでいた位置・選択の端の行・本文の幅と文字の倍率 */

/** 行の包みの重ねた余白（CSS の --row-ink。包みの上下に同じだけ取って外へ戻す余白）。測った高さからこの分を引く。なければ 0 */
export function inkOf(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).getPropertyValue("--row-ink")) || 0;
}

/** 描くのを省いているか（content-visibility: auto で省かれている行は、中の要素が見えないと答える） */
export function skippedRow(el: HTMLElement): boolean {
  const child = el.firstElementChild;
  return child !== null && typeof child.checkVisibility === "function" && !child.checkVisibility({ contentVisibilityAuto: true });
}

/** 行の要素（測っている間）と並び */
export interface RowEls {
  els: ReadonlyMap<string, HTMLElement>;
  indexOf: ReadonlyMap<string, number>;
}

/** 流れの最初の行の上端の、スクロールする中身の中での位置（描いている行の要素から逆算する） */
export function originOf(el: HTMLElement, rows: RowEls, m: RowMetrics): number {
  const box = el.getBoundingClientRect();
  for (const [key, row] of rows.els) {
    const i = rows.indexOf.get(key);
    if (i === undefined || m.heights[i] === 0 || !row.isConnected) continue;
    return row.getBoundingClientRect().top + inkOf(row) - box.top + el.scrollTop - m.offsets[i];
  }
  return 0;
}

/** 行 key の上端の、見えている上端からの距離（描いていない行は前からの和で。行がなければ undefined） */
export function topOfRow(el: HTMLElement, rows: RowEls, m: () => RowMetrics, key: string): number | undefined {
  const i = rows.indexOf.get(key);
  if (i === undefined) return undefined;
  const row = rows.els.get(key);
  const box = el.getBoundingClientRect();
  if (row?.isConnected) return row.getBoundingClientRect().top + inkOf(row) - box.top;
  const metrics = m();
  return metrics.offsets[i] + originOf(el, rows, metrics) - el.scrollTop;
}

/** 読んでいた位置（見えている上端をまたぐ行のキーと、その行の上端から見えている上端までの距離。行がなければ null） */
export function positionOf(el: HTMLElement, rows: RowEls): { key: string; offset: number } | null {
  if (el.clientHeight === 0) return null;
  const box = el.getBoundingClientRect();
  let best: { key: string; top: number } | null = null;
  for (const [key, row] of rows.els) {
    if (!row.isConnected || rows.indexOf.get(key) === undefined) continue;
    const r = row.getBoundingClientRect();
    const ink = inkOf(row);
    if (r.bottom - ink <= box.top) continue;
    const top = r.top + ink;
    if (!best || top < best.top) best = { key, top };
  }
  return best ? { key: best.key, offset: box.top - best.top } : null;
}

/** 選択の端の行の間（流れの中の行の番号。流れより前の端は -1、後ろの端は n。残さないなら null） */
export function selectionRange(list: HTMLElement | null, keys: readonly string[], indexOf: ReadonlyMap<string, number>): { start: number; end: number } | null {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || !list) return null;
  const indexOfNode = (node: Node | null): number => {
    if (!node) return -1;
    if (!list.contains(node)) return list.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING ? -1 : keys.length;
    for (let el: Element | null = node instanceof Element ? node : node.parentElement; el && el !== list; el = el.parentElement) {
      const key = (el as HTMLElement).dataset?.rowKey;
      if (key !== undefined) return indexOf.get(key) ?? -1;
    }
    return keys.length;
  };
  return keepRange(indexOfNode(sel.anchorNode), indexOfNode(sel.focusNode), keys.length);
}

/** 外さずに残す行: ピントがある・書いている欄がある（書き直し中の発言・伝える欄）・中を触った図・開いたメニュー */
export function keepsRow(row: HTMLElement | undefined, active: Element | null): boolean {
  return row !== undefined && ((active !== null && row.contains(active)) || row.querySelector("textarea, input, [data-keep-row]") !== null);
}

/** 行の並びの本文の幅（30px 刻み）・文字の倍率（--chat-scale）・gap */
export function readRowLayout(list: HTMLElement): { width: number; scale: number; gap: number } {
  const cs = getComputedStyle(list);
  const width = Math.round((list.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)) / 30) * 30;
  return { width, scale: parseFloat(cs.getPropertyValue("--chat-scale")) || 1, gap: parseFloat(cs.rowGap) || 0 };
}
