// 表のセルで書く状態を持つ StateField（どのセルを開いているか・ピントが編集の部品の中にあるか）と、ピントの見張り。
// 置き換えて描く飾り（blockWidgets）とセルの書く部品（cellEditor・cellKeys）の両方が読む
import { Facet, StateField, type EditorState, type TransactionSpec } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { editorFocusEffect, nextFocused, nextOpenCell, type OpenCell } from "./tableState";

/** 表とセル（右クリックしたセル） */
export type TableTarget = OpenCell;

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

/** 右クリックした表のセル（メニューを開くときに 1 回だけ読む） */
const menuTargets = new WeakMap<EditorView, TableTarget>();

export const setTableMenuTarget = (main: EditorView, target: TableTarget | null) => void (target ? menuTargets.set(main, target) : menuTargets.delete(main));

/** 右クリックした表のセルを受け取る（受け取ったら消す。表の外の右クリックなら null） */
export function takeTableMenuTarget(main: EditorView): TableTarget | null {
  const target = menuTargets.get(main) ?? null;
  menuTargets.delete(main);
  return target;
}
