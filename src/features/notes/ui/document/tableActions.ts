// 表の行・列を足す・消す操作を、本体の書き換えにして当てる（右クリックのメニュー・「＋」・Tab と Enter の行の足し）。
// そろえた表は、書き換えたあとにそろえ直す（同じ 1 回の元に戻す）。当てたあと、足したセルなどを開く
import { Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { tableAligns, type ColumnAlign } from "./tableBlocks";
import { alignTableChanges, isAlignedTable, type TextChange } from "./tableEdit";
import { focusNextCell, type TableTarget } from "./tableField";
import { bodyRows, cellRange, columnCount, type CellAddress } from "./tableModel";
import { docText, fromCell, openCellEffect, openTable } from "./tableState";
import { deleteColumn, deleteRow, deleteTable, insertColumn, insertRow, insertTableAt, setColumnAlign } from "./tableStructure";


/** 書き換えを当て、after のセルを開く（null なら閉じて本体にピントを戻す。undefined なら開いたまま） */
function apply(main: EditorView, target: TableTarget, changes: TextChange[], after: CellAddress | null | undefined) {
  if (!changes.length) return;
  const state = main.state;
  const table = openTable(state, target);
  if (!table) return;
  const first = state.update({ changes });
  const aligned = isAlignedTable(docText(state), table);
  const mapped = first.changes.mapPos(target.tableFrom);
  const next = openTable(first.state, { ...target, tableFrom: mapped });
  const later = aligned && next ? alignTableChanges(docText(first.state), next) : [];
  const finalState = later.length ? first.state.update({ changes: later }).state : first.state;
  const finalTable = openTable(finalState, { ...target, tableFrom: mapped });
  const range = after && finalTable ? cellRange(docText(finalState), finalTable, after) : null;
  const effects = after === undefined ? [] : [openCellEffect.of(after && finalTable ? { tableFrom: mapped, ...after } : null)];
  const selection = range ? { anchor: range.to } : after === null ? { anchor: Math.min(mapped, finalState.doc.length) } : undefined;
  if (after) focusNextCell(main);
  main.dispatch(
    state.update(
      { changes, annotations: [fromCell.of(true), Transaction.userEvent.of("input.table")] },
      { changes: later, sequential: true, effects, selection, scrollIntoView: true },
    ),
  );
  if (after === null) main.focus();
}

/** 行を足して、足した行の同じ列のセルを開く */
export function addRow(main: EditorView, target: TableTarget, where: "above" | "below") {
  const table = openTable(main.state, target);
  if (!table) return;
  const { changes, row } = insertRow(docText(main.state), table, target.row, where);
  apply(main, target, changes, { row, col: target.col });
}

/** 列を足して、足した列の同じ行のセルを開く */
export function addColumn(main: EditorView, target: TableTarget, where: "left" | "right") {
  const table = openTable(main.state, target);
  if (!table) return;
  const { changes, col } = insertColumn(docText(main.state), table, target.col, where);
  apply(main, target, changes, { row: target.row, col });
}

/** 最後に行・列を足す（表の端の「＋」） */
export function appendRow(main: EditorView, tableFrom: number) {
  const table = openTable(main.state, { tableFrom, row: 0, col: 0 });
  if (table) addRow(main, { tableFrom, row: bodyRows(table).length - 1, col: 0 }, "below");
}

export function appendColumn(main: EditorView, tableFrom: number) {
  const table = openTable(main.state, { tableFrom, row: 0, col: 0 });
  if (table) addColumn(main, { tableFrom, row: 0, col: columnCount(docText(main.state), table) - 1 }, "right");
}

/** 右クリックのメニューの項目（表のセルで開いたとき） */
export interface TableMenuItem {
  label: string;
  run: () => void;
}

/** 表のセルの右クリックのメニューの項目（見出しの行は消せない・上に足せない、列が 1 つなら列を消せない） */
export function tableMenuItems(main: EditorView, target: TableTarget): TableMenuItem[] {
  const table = openTable(main.state, target);
  if (!table) return [];
  const text = docText(main.state);
  const columns = columnCount(text, table);
  const delimiter = table.rows.find((r) => r.delimiter);
  const current = delimiter ? (tableAligns(text.slice(delimiter.from, delimiter.to))[target.col] ?? null) : null;
  const align = (value: ColumnAlign) => () => apply(main, target, setColumnAlign(docText(main.state), openTable(main.state, target)!, target.col, value), target);
  const items: (TableMenuItem | false)[] = [
    target.row > 0 && { label: "上に行を足す", run: () => addRow(main, target, "above") },
    { label: "下に行を足す", run: () => addRow(main, target, "below") },
    { label: "左に列を足す", run: () => addColumn(main, target, "left") },
    { label: "右に列を足す", run: () => addColumn(main, target, "right") },
    target.row > 0 && { label: "行を消す", run: () => apply(main, target, deleteRow(docText(main.state), openTable(main.state, target)!, target.row), { row: target.row - 1, col: target.col }) },
    columns > 1 && { label: "列を消す", run: () => apply(main, target, deleteColumn(docText(main.state), openTable(main.state, target)!, target.col), { row: target.row, col: Math.max(0, target.col - 1) }) },
    current !== "left" && { label: "列を左寄せ", run: align("left") },
    current !== "center" && { label: "列を中央寄せ", run: align("center") },
    current !== "right" && { label: "列を右寄せ", run: align("right") },
    current !== null && { label: "列の寄せを外す", run: align(null) },
    { label: "表を消す", run: () => apply(main, target, deleteTable(docText(main.state), openTable(main.state, target)!), null) },
  ];
  return items.filter((i): i is TableMenuItem => i !== false);
}

/** カーソルの行に空の表を入れて、見出しの最初のセルを開く */
export function insertTable(main: EditorView) {
  const { change, tableFrom } = insertTableAt(docText(main.state), main.state.selection.main.head);
  focusNextCell(main);
  main.dispatch({ changes: change, annotations: Transaction.userEvent.of("input.table"), scrollIntoView: true });
  // 入れた表は次の読み取りで見つかるので、そのあとで開く
  queueMicrotask(() => {
    const table = openTable(main.state, { tableFrom, row: 0, col: 0 });
    const range = table && cellRange(docText(main.state), table, { row: 0, col: 0 });
    if (!range) return;
    focusNextCell(main);
    main.dispatch({ effects: openCellEffect.of({ tableFrom, row: 0, col: 0 }), selection: { anchor: range.to }, annotations: fromCell.of(true) });
  });
}
