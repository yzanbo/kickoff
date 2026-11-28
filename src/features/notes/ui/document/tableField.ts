// 表のセルで書く状態を持つ StateField（どのセルを開いているか・ピントが編集の部品の中にあるか（editorFocus。セルを開いたら中にある扱い））。
// 置き換えて描く飾り（blockWidgets）とセルの書く部品（cellEditor・cellKeys）の両方が読む
import { Facet, StateField, type EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { editorFocus } from "./editorFocus";
import type { TableBlock } from "./tableBlocks";
import { nextFocused, nextOpenCell, openCellRange, openTable, type OpenCell } from "./tableState";

interface TableCellState {
  focused: boolean;
  open: OpenCell | null;
}

const sameCell = (a: OpenCell | null, b: OpenCell | null) => a === b || (!!a && !!b && a.tableFrom === b.tableFrom && a.row === b.row && a.col === b.col);

const tableCellField = StateField.define<TableCellState>({
  create: () => ({ focused: false, open: null }),
  update(value, tr) {
    const focused = nextFocused(value.focused, tr);
    const open = nextOpenCell(value.open, value.focused, focused, tr);
    if (focused === value.focused && sameCell(open, value.open)) return value;
    return { focused, open: sameCell(open, value.open) ? value.open : open };
  },
});

/** 表のセルで書く状態（ピントの見張りも入れる） */
export const tableCells = [editorFocus, tableCellField];

/** 開いているセル（なければ null） */
export const openCellOf = (state: EditorState): OpenCell | null => state.field(tableCellField, false)?.open ?? null;

/** 開いているセルとその表（開いていなければ null） */
export function openCellTable(state: EditorState): { open: OpenCell; table: TableBlock } | null {
  const open = openCellOf(state);
  const table = open && openTable(state, open.tableFrom);
  return open && table ? { open, table } : null;
}

/** 開いているセルの元の文字の範囲（開いていない・その行に書いていないセルは null） */
export function openCellRangeOf(state: EditorState) {
  const open = openCellOf(state);
  return open && openCellRange(state, open);
}

/** 次に作るセルの部品にピントを移すか（押した・セルの間を動いた） */
const focusRequests = new WeakSet<EditorView>();

/**
 * セルを開く書き換えを送り、開いたセルの部品へピントを移す（押した・キーで動いたとき）。
 * 開くセルが替わらなかった（開けなかった・表を書けない表示・同じセルのまま）ときは、部品を作り直さないので頼みを残さない
 * （残すと、あとで ⌘F の当たりで開いたセルが検索の欄からピントを奪う）
 */
export function dispatchOpeningCell(main: EditorView, ...specs: TransactionSpec[]) {
  const before = openCellOf(main.state);
  focusRequests.add(main);
  main.dispatch(...specs);
  const after = openCellOf(main.state);
  if (!after || sameCell(before, after)) focusRequests.delete(main);
}

/** ピントを移す頼みを受け取る（あれば true。受け取ったら消す） */
export const takeFocusRequest = (main: EditorView) => focusRequests.delete(main);

/** 編集の部品の右クリックのメニューを開く口（表のセルの右クリックから呼ぶ。本体の右クリックは NoteEditor が受ける） */
export const editorContextMenuFacet = Facet.define<(at: { x: number; y: number }) => void, ((at: { x: number; y: number }) => void) | null>({
  combine: (values) => values[0] ?? null,
});

/** 編集の部品が右クリックのメニューに足す項目 */
export interface EditorMenuItem {
  label: string;
  run: () => void;
}

/** 右クリックした表のセル（メニューを開くときに 1 回だけ読む） */
const menuTargets = new WeakMap<EditorView, OpenCell>();

export const setTableMenuTarget = (main: EditorView, target: OpenCell | null) => void (target ? menuTargets.set(main, target) : menuTargets.delete(main));

/** 右クリックした表のセルを受け取る（受け取ったら消す。表の外の右クリックなら null） */
export function takeTableMenuTarget(main: EditorView): OpenCell | null {
  const target = menuTargets.get(main) ?? null;
  menuTargets.delete(main);
  return target;
}
