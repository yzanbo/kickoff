// 表の行・列を足す・消す、列の寄せを変える、表を入れる・消す純粋な関数（書き換えは元の文の位置で返す）。
// その表の書き方に合わせる: 頭と終わりの | の有無・行の頭の印（リストの字下げ・引用の >）は見出しの行に合わせ、
// | で区切った行は | の所に足す・消すだけで、ほかのセルの書き方を変えない（そろえた表は、呼ぶ側があとでそろえ直す）
import { pipeIndexes, rowFraming, type ColumnAlign, type TableBlock, type TableRowSource } from "./tableBlocks";
import { delimiterCell, type TextChange } from "./tableEdit";
import { bodyRows, columnCount, delimiterRow, rowCells } from "./tableModel";

/** 行の中の、\ で消していない | の位置（文の中の位置） */
const rowPipes = (text: string, row: TableRowSource) => pipeIndexes(text, row.from, row.to);

/** 行の頭と終わりが | か */
const framed = (text: string, row: TableRowSource) => rowFraming(text.slice(row.from, row.to));

/** 空の行（見出しの行と同じ印・同じ頭と終わりの |） */
function emptyRow(text: string, table: TableBlock): string {
  const head = bodyRows(table)[0];
  const { lead, trail } = framed(text, head);
  const cells = Array.from({ length: columnCount(text, table) }, () => "");
  return `${text.slice(head.lineFrom, head.from)}${lead ? "| " : ""}${cells.join(" | ")}${trail ? " |" : ""}`;
}

/** 行を足す（row の上か下。見出しの行の上には足さない。見出しの下は区切りの行の下）。足した行の番号も返す */
export function insertRow(text: string, table: TableBlock, row: number, where: "above" | "below"): { changes: TextChange[]; row: number } {
  const rows = bodyRows(table);
  const line = emptyRow(text, table);
  if (where === "above" && row > 0) return { changes: [{ from: rows[row].lineFrom, to: rows[row].lineFrom, insert: `${line}\n` }], row };
  // 見出しの行の下に足すときは、区切りの行のすぐ下
  const after = (row === 0 && delimiterRow(table)) || rows[row];
  return { changes: [{ from: after.to, to: after.to, insert: `\n${line}` }], row: row + 1 };
}

/** 行を消す（見出しの行は消さない） */
export function deleteRow(text: string, table: TableBlock, row: number): TextChange[] {
  if (row === 0) return [];
  const target = bodyRows(table)[row];
  if (!target) return [];
  // 行の後ろの改行ごと消す（文の最後の行なら前の改行ごと）
  return target.to < text.length ? [{ from: target.lineFrom, to: target.to + 1, insert: "" }] : [{ from: target.lineFrom - 1, to: target.to, insert: "" }];
}

/** 列を足す（col の左か右）。足した列の番号も返す */
export function insertColumn(text: string, table: TableBlock, col: number, where: "left" | "right"): { changes: TextChange[]; col: number } {
  const at = where === "left" ? col : col + 1;
  const changes: TextChange[] = [];
  for (const row of table.rows) {
    const pipes = rowPipes(text, row);
    const { lead, trail } = framed(text, row);
    const cells = rowCells(text, row).length;
    const cell = row.delimiter ? "---" : " ";
    // 足す所の左の |（行の頭の | から数える）。その右に「中身 |」を足す
    const leftPipe = lead ? pipes[Math.min(at, cells)] : at === 0 ? undefined : pipes[Math.min(at, cells) - 1];
    if (at >= cells && !trail) {
      // 終わりに | のない行の最後に足す（空のセルは | で閉じないと読まれない）
      changes.push({ from: row.to, to: row.to, insert: row.delimiter ? `|${cell}|` : " |  |" });
    } else if (leftPipe === undefined) {
      // 頭に | のない行の最初に足す（空のセルは頭の | がないと読まれない）
      changes.push({ from: row.from, to: row.from, insert: row.delimiter ? `|${cell}|` : "| | " });
    } else {
      changes.push({ from: leftPipe + 1, to: leftPipe + 1, insert: `${cell}|` });
    }
  }
  return { changes, col: at };
}

/** 列を消す（列が 1 つの表では消さない） */
export function deleteColumn(text: string, table: TableBlock, col: number): TextChange[] {
  if (columnCount(text, table) <= 1) return [];
  const changes: TextChange[] = [];
  for (const row of table.rows) {
    const pipes = rowPipes(text, row);
    const { lead } = framed(text, row);
    const cells = rowCells(text, row);
    if (col >= cells.length) continue;
    // セルの左の |（頭に | がなければ行の頭）から、右の | の手前まで。最初のセルで頭に | がなければ右の | まで
    const left = lead ? pipes[col] : col === 0 ? row.from - 1 : pipes[col - 1];
    const right = lead ? pipes[col + 1] : pipes[col];
    // | のない行が 1 列になると | が 1 つも残らず表でなくなるので、終わりに | を残す
    const keepPipe = !lead && pipes.length === 1;
    if (right === undefined) changes.push({ from: keepPipe ? left + 1 : left, to: row.to, insert: "" });
    else changes.push({ from: left + 1, to: right + 1, insert: "" }, ...(keepPipe ? [{ from: row.to, to: row.to, insert: row.delimiter ? "|" : " |" }] : []));
  }
  return changes;
}

/** 列の寄せを変える（区切りの行のそのセルの : を付け替える。- の数はそのまま） */
export function setColumnAlign(text: string, table: TableBlock, col: number, align: ColumnAlign): TextChange[] {
  const delimiter = delimiterRow(table);
  const cell = delimiter && rowCells(text, delimiter)[col];
  if (!cell) return [];
  return [{ from: cell.from, to: cell.to, insert: delimiterCell(text.slice(cell.from, cell.to).replace(/:/g, "").length, align) }];
}

/** 表を消す（後ろの改行ごと） */
export function deleteTable(text: string, table: TableBlock): TextChange[] {
  return [table.to < text.length ? { from: table.from, to: table.to + 1, insert: "" } : { from: Math.max(0, table.from - 1), to: table.to, insert: "" }];
}

/** 新しく入れる表（見出しの行と 1 行・3 列の空の表） */
export const NEW_TABLE = "|  |  |  |\n|---|---|---|\n|  |  |  |";

/**
 * 表を入れる書き換え（カーソルの行が空ならその行に、文があればその行の後ろに空行をはさんで）。入れた表の頭の位置も返す
 */
export function insertTableAt(text: string, pos: number): { change: TextChange; tableFrom: number } {
  const lineFrom = text.lastIndexOf("\n", pos - 1) + 1;
  const lineEnd = text.indexOf("\n", pos) < 0 ? text.length : text.indexOf("\n", pos);
  if (text.slice(lineFrom, lineEnd).trim() === "") {
    // 前の行に文があれば空行をはさむ（段落の続きとして読まれないように）
    const before = lineFrom > 0 && text.slice(text.lastIndexOf("\n", lineFrom - 2) + 1, lineFrom - 1).trim() !== "" ? "\n" : "";
    return { change: { from: lineFrom, to: lineEnd, insert: `${before}${NEW_TABLE}` }, tableFrom: lineFrom + before.length };
  }
  return { change: { from: lineEnd, to: lineEnd, insert: `\n\n${NEW_TABLE}` }, tableFrom: lineEnd + 2 };
}
