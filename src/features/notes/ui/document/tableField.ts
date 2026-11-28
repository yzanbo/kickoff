// 表のセルで書く状態を持つ StateField（どのセルを開いているか・ピントが編集の部品の中にあるか）と、ピントの見張り。
// 置き換えて描く飾り（blockWidgets）とセルの書く部品（cellEditor・cellKeys）の両方が読む
import { StateField, type EditorState } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { editorFocusEffect, nextFocused, nextOpenCell, type OpenCell } from "./tableState";

interface TableCellState {
  focused: boolean;
  open: OpenCell | null;
}

const sameCell = (a: OpenCell | null, b: OpenCell | null) => a === b || (!!a && !!b && a.tableFrom === b.tableFrom && a.row === b.row && a.col === b.col);

export const tableCellField = StateField.define<TableCellState>({
  create: () => ({ focused: false, open: null }),
  update(value, tr) {
    const focused = nextFocused(value.focused, tr);
    const open = nextOpenCell(value.open, value.focused, focused, tr);
    if (focused === value.focused && sameCell(open, value.open)) return value;
    return { focused, open: sameCell(open, value.open) ? value.open : open };
  },
});

/** 開いているセル（なければ null） */
export const openCellOf = (state: EditorState): OpenCell | null => state.field(tableCellField, false)?.open ?? null;

/**
 * ピントが編集の部品（本体かセルの書く部品）の中にあるかを、表の状態に伝える（外へ出たら開いているセルを閉じる）。
 * セルの書く部品にピントが移ると本体はピントを失うので、本体の hasFocus でなく、ピントのある要素が本体の中かで決める
 */
export function syncEditorFocus(view: EditorView) {
  queueMicrotask(() => {
    const focused = view.dom.contains(document.activeElement);
    if (view.state.field(tableCellField, false)?.focused !== focused) view.dispatch({ effects: editorFocusEffect.of(focused) });
  });
}

export const focusWatcher = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {}
    update(u: ViewUpdate) {
      if (u.focusChanged) syncEditorFocus(this.view);
    }
  },
);

/** 次に作るセルの部品にピントを移すか（押した・セルの間を動いた） */
const focusRequests = new WeakSet<EditorView>();

/** 次に開くセルの部品へピントを移す（押した・キーで動いたとき） */
export const focusNextCell = (main: EditorView) => void focusRequests.add(main);

/** ピントを移す頼みを受け取る（あれば true。受け取ったら消す） */
export const takeFocusRequest = (main: EditorView) => focusRequests.delete(main);
