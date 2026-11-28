// 表のセルの場所を引く純粋な関数（セルで書くときに、何行目・何列目かと元の文字の範囲を行き来する）。
// 行の番号は見出しの行が 0、区切りの行は数えない。列の番号は左から 0
import { splitTableRow, type TableBlock, type TableCellSource, type TableRowSource } from "./tableBlocks";

/** セルの場所（何行目・何列目） */
export interface CellAddress {
  row: number;
  col: number;
}

/** 表の行（区切りの行を除く。見出しの行が先頭） */
export const bodyRows = (table: TableBlock): TableRowSource[] => table.rows.filter((r) => !r.delimiter);

/** 列の数（見出しの行のセルの数。返答の表示もこの数で描く） */
export function columnCount(text: string, table: TableBlock): number {
  const head = bodyRows(table)[0];
  return splitTableRow(text.slice(head.from, head.to), head.from).length;
}

/** 行のセル（書いてあるものだけ。見出しより多い分も含む） */
export function rowCells(text: string, row: TableRowSource): TableCellSource[] {
  return splitTableRow(text.slice(row.from, row.to), row.from);
}

/** セルの元の文字の範囲（その行に書いていない（足りない）セルは null） */
export function cellRange(text: string, table: TableBlock, at: CellAddress): TableCellSource | null {
  const row = bodyRows(table)[at.row];
  if (!row) return null;
  return rowCells(text, row)[at.col] ?? null;
}

/** pos を含む表（なければ null） */
export function tableAt(tables: readonly TableBlock[], pos: number): TableBlock | null {
  return tables.find((t) => pos >= t.from && pos <= t.to) ?? null;
}

/**
 * pos のあるセル。セルの外（| の上・行の頭の印・区切りの行）なら近いセルに寄せる:
 * 区切りの行は見出しの行の最初のセル、セルの間は左のセル（行の頭より前は最初のセル）。見出しより右のセルは最後の列に寄せる
 */
export function cellAt(text: string, table: TableBlock, pos: number): CellAddress {
  const rows = bodyRows(table);
  const rowIndex = rows.findIndex((r) => pos >= r.lineFrom && pos <= r.to);
  if (rowIndex < 0) return { row: 0, col: 0 };
  const cells = rowCells(text, rows[rowIndex]);
  let col = 0;
  cells.forEach((c, i) => {
    if (pos >= c.from) col = i;
  });
  return { row: rowIndex, col: Math.min(col, columnCount(text, table) - 1) };
}

/** 次のセル（左から右、行の終わりは次の行の頭。最後のセルの次は null） */
export function nextCell(at: CellAddress, columns: number, rows: number): CellAddress | null {
  if (at.col + 1 < columns) return { row: at.row, col: at.col + 1 };
  return at.row + 1 < rows ? { row: at.row + 1, col: 0 } : null;
}

/** 前のセル（最初のセルの前は null） */
export function previousCell(at: CellAddress, columns: number): CellAddress | null {
  if (at.col > 0) return { row: at.row, col: at.col - 1 };
  return at.row > 0 ? { row: at.row - 1, col: columns - 1 } : null;
}

/**
 * 表だけの Markdown から、セル 1 つの中身を抜いたもの（書いているセルは描かないので、そのセルの中身が変わっても表を描き直さない）
 */
export function markdownWithoutCell(text: string, table: TableBlock, range: TableCellSource): string {
  return table.rows.map((r) => (range.from >= r.from && range.to <= r.to ? text.slice(r.from, range.from) + text.slice(range.to, r.to) : text.slice(r.from, r.to))).join("\n");
}
