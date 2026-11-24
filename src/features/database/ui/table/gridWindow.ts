// DB の結果の表の窓: 行も列も見えている所だけ描く範囲と、選んだセルを見せるスクロールの位置（DataGrid）

/** 行の高さ（見えている所だけ描くので、どの行も同じ高さにする） */
export const ROW_HEIGHT = 26;
/** 見えている所の前後に余分に描く行の数 */
const OVERSCAN = 12;
/** 見えている所の左右に余分に描く列の数（列も見えている所だけ描く。何百列でも重くしない） */
const COL_OVERSCAN = 3;
/** 列の幅 */
export const COLUMN_WIDTH = 180;
/** 行の番号の列の幅 */
export const INDEX_WIDTH = 52;
/** 列の見出しの高さ（上に貼り付くので、選んだセルを見せるときに除く） */
const HEAD_HEIGHT = 28;

/** スクロールの位置と見えている大きさ */
export interface GridView {
  top: number;
  height: number;
  left: number;
  width: number;
}

/** i 列目（0 から）の、番号の列を除いた左端 */
export const colLeft = (i: number) => i * COLUMN_WIDTH;

/** 描く行 [first, last) と列 [colFirst, colLast) */
export function visibleRange(view: GridView, rows: number, cols: number) {
  return {
    first: Math.max(0, Math.floor(view.top / ROW_HEIGHT) - OVERSCAN),
    last: Math.min(rows, Math.ceil((view.top + view.height) / ROW_HEIGHT) + OVERSCAN),
    colFirst: Math.max(0, Math.floor((view.left - INDEX_WIDTH) / COLUMN_WIDTH) - COL_OVERSCAN),
    colLast: Math.min(cols, Math.ceil((view.left + view.width) / COLUMN_WIDTH) + COL_OVERSCAN),
  };
}

/** 選んだセルが見えるスクロールの位置（上の見出しと左の番号の列の下に隠さない。見えていればそのまま） */
export function scrollToReveal(view: GridView, row: number, col: number): { top: number; left: number } {
  const top = row * ROW_HEIGHT;
  const left = colLeft(col);
  const nextTop = top < view.top ? top : HEAD_HEIGHT + top + ROW_HEIGHT > view.top + view.height ? HEAD_HEIGHT + top + ROW_HEIGHT - view.height : view.top;
  const nextLeft = left < view.left ? left : INDEX_WIDTH + left + COLUMN_WIDTH > view.left + view.width ? INDEX_WIDTH + left + COLUMN_WIDTH - view.width : view.left;
  return { top: nextTop, left: nextLeft };
}
