// 表のセルで書く状態（どの表のどのセルを開いているか）と、その決め方。
// 開くのは、セルを押した・セルの間を動いた（openCellEffect）か、本体の選んだ範囲が表のセルに入った（元に戻す・検索・行へ移る）とき。
// 閉じるのは、選んだ範囲が表の外へ出た・ピントが編集の部品の外へ出たとき
import { Annotation, StateEffect, type EditorState, type Transaction } from "@codemirror/state";
import { docText, tablesOf } from "./noteDoc";
import type { TableBlock } from "./tableBlocks";
import { cellAt, cellRange, tableAt, type CellAddress } from "./tableModel";

/** 開いているセル（表は最初の行の頭の位置で指す。書き換えに合わせて動かす） */
export interface OpenCell extends CellAddress {
  tableFrom: number;
}

/** セルを開く・閉じる（null）。開くときはピントもセルへ移す */
export const openCellEffect = StateEffect.define<OpenCell | null>({
  map: (value, mapping) => value && { ...value, tableFrom: mapping.mapPos(value.tableFrom) },
});

/** セルの中の編集の部品から来た書き換え・選んだ範囲（開いているセルを選び直さない） */
export const fromCell = Annotation.define<boolean>();

/** ピントが編集の部品（本体かセル）の中にあるか（変わったら知らせる） */
export const editorFocusEffect = StateEffect.define<boolean>();

/** 最初の行の頭が tableFrom の表（もう表でなくなっていれば null） */
export function openTable(state: EditorState, tableFrom: number): TableBlock | null {
  return tablesOf(state).find((t) => t.from === tableFrom) ?? null;
}

/** 開いているセルの元の文字の範囲（足りないセルは null） */
export function openCellRange(state: EditorState, open: OpenCell) {
  const table = openTable(state, open.tableFrom);
  return table ? cellRange(docText(state), table, open) : null;
}

/**
 * 書き換えのあとの開いているセル。effect が来ればそれ、ピントが外へ出れば閉じ、
 * セルの部品からでない選んだ範囲の動き（元に戻す・検索・行へ移る・本文を押した）か、ピントが戻ったときは、範囲のあるセルを開く（表の外なら閉じる）
 */
export function nextOpenCell(prev: OpenCell | null, wasFocused: boolean, focused: boolean, tr: Transaction): OpenCell | null {
  let open = prev && { ...prev, tableFrom: tr.changes.mapPos(prev.tableFrom) };
  const effect = tr.effects.find((e) => e.is(openCellEffect));
  if (effect) open = effect.value;
  else if (!focused) open = null;
  else if ((tr.selection && !tr.annotation(fromCell)) || (!wasFocused && !prev)) {
    const { main } = tr.state.selection;
    const table = tableAt(tablesOf(tr.state), main.head);
    const inside = table && main.anchor >= table.from && main.anchor <= table.to;
    // 範囲の頭のセル（検索の当たりはその頭、行へ移るときは行の最初のセル）
    open = inside ? { tableFrom: table.from, ...cellAt(docText(tr.state), table, main.from) } : null;
  }
  return open && openTable(tr.state, open.tableFrom) ? open : null;
}

/** ピントの様子（effect が来たらその値。セルを開いたら中にある） */
export function nextFocused(prev: boolean, tr: Transaction): boolean {
  const opened = tr.effects.some((e) => e.is(openCellEffect) && e.value !== null);
  const effect = tr.effects.find((e) => e.is(editorFocusEffect));
  return opened || (effect ? effect.value : prev);
}
