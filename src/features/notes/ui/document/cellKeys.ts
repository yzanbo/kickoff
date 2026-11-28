// 表のセルの中のキー: Tab / ⇧Tab で隣のセル、Enter で下のセル、⇧Enter でセルの中の改行（<br>）、
// 矢印はセルの端まで来たら隣のセル（表の端なら表の外の行）、Esc で表のすぐ後ろの行へ出る。⌘Z は本体の履歴で戻す
import { redo, undo } from "@codemirror/commands";
import type { EditorView, KeyBinding } from "@codemirror/view";
import { addRow } from "./tableActions";
import { dispatchOpeningCell, openCellOf } from "./tableField";
import { bodyRows, cellRange, columnCount, nextCell, previousCell, type CellAddress } from "./tableModel";
import { docText, tablesOf } from "./noteDoc";
import { fromCell, openCellEffect, openTable } from "./tableState";

/** 開いているセルの表と場所 */
function current(main: EditorView) {
  const open = openCellOf(main.state);
  const table = open && openTable(main.state, open);
  return open && table ? { open, table, text: docText(main.state) } : null;
}

/** セル target を開く（place: 中身の頭か終わりにカーソル）。target が null なら何もしない */
export function openCell(main: EditorView, tableFrom: number, target: CellAddress, place: "start" | "end") {
  const table = openTable(main.state, { tableFrom, ...target });
  if (!table) return;
  const range = cellRange(docText(main.state), table, target);
  const row = bodyRows(table)[target.row];
  const pos = range ? (place === "start" ? range.from : range.to) : row.to;
  dispatchOpeningCell(main, { effects: openCellEffect.of({ tableFrom, ...target }), selection: { anchor: pos }, annotations: fromCell.of(true), scrollIntoView: true });
}

/** 表の外へ出る（up: 表の前の行の終わり / down: 表の後ろの行の頭。表が文の最後なら空の行を足す） */
export function leaveTable(main: EditorView, direction: "up" | "down") {
  const here = current(main);
  if (!here) return;
  const { table } = here;
  const effects = openCellEffect.of(null);
  if (direction === "up") {
    main.dispatch({ effects, selection: { anchor: Math.max(0, table.from - 1) }, annotations: fromCell.of(true), scrollIntoView: true });
  } else if (table.to < main.state.doc.length) {
    main.dispatch({ effects, selection: { anchor: table.to + 1 }, annotations: fromCell.of(true), scrollIntoView: true });
  } else {
    main.dispatch({ effects, changes: { from: table.to, insert: "\n" }, selection: { anchor: table.to + 1 }, annotations: fromCell.of(true), scrollIntoView: true });
  }
  main.focus();
}

/** 隣のセルへ（なければ false） */
function move(main: EditorView, pick: (at: CellAddress, columns: number, rows: number) => CellAddress | null, place: "start" | "end"): boolean {
  const here = current(main);
  if (!here) return false;
  const target = pick(here.open, columnCount(here.text, here.table), bodyRows(here.table).length);
  if (!target) return false;
  openCell(main, here.table.from, target, place);
  return true;
}

/** カーソルが部品の最初（up）・最後（down）の見た目の行にあるか */
function atVisualEdge(cell: EditorView, direction: "up" | "down"): boolean {
  const head = cell.state.selection.main.head;
  const here = cell.coordsAtPos(head);
  const edge = cell.coordsAtPos(direction === "up" ? 0 : cell.state.doc.length);
  if (!here || !edge) return true;
  return direction === "up" ? here.top <= edge.top + 1 : here.bottom >= edge.bottom - 1;
}

/** 上下の矢印: 端の行なら上下のセルへ、表の端なら表の外へ */
function vertical(main: EditorView, cell: EditorView, direction: "up" | "down"): boolean {
  if (!cell.state.selection.main.empty || !atVisualEdge(cell, direction)) return false;
  const here = current(main);
  if (!here) return false;
  const rows = bodyRows(here.table).length;
  const row = here.open.row + (direction === "up" ? -1 : 1);
  if (row < 0 || row >= rows) leaveTable(main, direction);
  else openCell(main, here.table.from, { row, col: here.open.col }, direction === "up" ? "end" : "start");
  return true;
}

export function cellKeymap(main: EditorView): KeyBinding[] {
  const atStart = (cell: EditorView) => cell.state.selection.main.empty && cell.state.selection.main.head === 0;
  const atEnd = (cell: EditorView) => cell.state.selection.main.empty && cell.state.selection.main.head === cell.state.doc.length;
  return [
    // 最後のセルの Tab・最後の行の Enter は、行を足して移る
    { key: "Tab", run: () => move(main, nextCell, "end") || addRowFromCell(main, true) },
    { key: "Shift-Tab", run: () => move(main, (at, columns) => previousCell(at, columns), "end") || true },
    { key: "Enter", run: () => move(main, (at, _c, rows) => (at.row + 1 < rows ? { row: at.row + 1, col: at.col } : null), "end") || addRowFromCell(main, false) },
    {
      key: "Shift-Enter",
      run: (cell) => {
        cell.dispatch(cell.state.replaceSelection("<br>"), { userEvent: "input" });
        return true;
      },
    },
    { key: "ArrowLeft", run: (cell) => atStart(cell) && move(main, (at, columns) => previousCell(at, columns), "end") },
    { key: "ArrowRight", run: (cell) => atEnd(cell) && move(main, nextCell, "start") },
    { key: "ArrowUp", run: (cell) => vertical(main, cell, "up") },
    { key: "ArrowDown", run: (cell) => vertical(main, cell, "down") },
    {
      key: "Escape",
      run: () => {
        leaveTable(main, "down");
        return true;
      },
    },
    { key: "Mod-z", run: () => afterHistory(main, undo(main)) },
    { key: "Mod-Shift-z", run: () => afterHistory(main, redo(main)) },
    { key: "Mod-y", run: () => afterHistory(main, redo(main)) },
  ];
}

/** 開いているセルの下に行を足して移る（toFirst: 足した行の最初のセルへ。Tab のとき） */
function addRowFromCell(main: EditorView, toFirst: boolean): boolean {
  const open = openCellOf(main.state);
  if (open) addRow(main, { ...open, col: toFirst ? 0 : open.col }, "below");
  return true;
}

/** 元に戻したあと、カーソルが表の外へ出たら本体にピントを戻す */
function afterHistory(main: EditorView, done: boolean): boolean {
  if (done && !openCellOf(main.state)) main.focus();
  return true;
}

/** 本文から矢印で表に入る（表を飛び越さない）: 表のすぐ上の行から ↓ で見出しの行、すぐ下の行から ↑ で最後の行の最初のセル */
export const enterTableKeymap: KeyBinding[] = [
  { key: "ArrowDown", run: (main) => enterFrom(main, "down") },
  { key: "ArrowUp", run: (main) => enterFrom(main, "up") },
];

function enterFrom(main: EditorView, direction: "up" | "down"): boolean {
  const sel = main.state.selection.main;
  if (!sel.empty) return false;
  const line = main.state.doc.lineAt(sel.head);
  // 行の中で折り返していれば、最後（最初）の見た目の行にいるときだけ
  const edge = main.moveVertically(sel, direction === "down");
  if (main.state.doc.lineAt(edge.head).number === line.number && edge.head !== sel.head) return false;
  const neighbor = direction === "down" ? line.number + 1 : line.number - 1;
  if (neighbor < 1 || neighbor > main.state.doc.lines) return false;
  const target = main.state.doc.line(neighbor);
  const table = tablesOf(main.state).find((t) => (direction === "down" ? t.from === target.from : t.to === target.to));
  if (!table) return false;
  openCell(main, table.from, { row: direction === "down" ? 0 : bodyRows(table).length - 1, col: 0 }, "start");
  return true;
}
