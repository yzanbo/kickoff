// 表の開いているセルの中に置く、小さな編集の部品（CodeMirror）。中身はそのセルの元の文字そのもので、
// 書いた変更は本体の文の書き換えにして送る（元に戻す履歴は本体の 1 本。この部品は履歴を持たない）。
// 本体がほかから変わった（元に戻す・置き換え・読み直し）ときは、本体からこの部品へ写す（cellSync）
import { defaultKeymap } from "@codemirror/commands";
import { Annotation, EditorState, Transaction, type ChangeSpec } from "@codemirror/state";
import { drawSelection, EditorView, keymap, runScopeHandlers, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { openCellOf, syncEditorFocus, takeFocusRequest } from "./tableField";
import { cellKeymap } from "./cellKeys";
import { alignTableChanges, escapeCellInput, fillMissingCell, isAlignedTable } from "./tableEdit";
import { bodyRows, cellRange } from "./tableModel";
import { docText, fromCell, openCellRange, openTable } from "./tableState";

/** 本体から写した書き換え（本体へ送り返さない） */
const fromMain = Annotation.define<boolean>();

const editorsByMain = new WeakMap<EditorView, EditorView>();

/** 開いているセルの書く部品（なければ null） */
export const cellEditorOf = (main: EditorView): EditorView | null => editorsByMain.get(main) ?? null;

/** 本体のキーのうち、セルの中でも本体で動かすもの（保存・検索・元に戻す） */
const FORWARDED_KEYS = new Set(["s", "f", "g", "z", "y"]);

/** セルの部品の変更を、本体の文の書き換えにして送る（そろえた表は、そろえたまま書き戻す） */
function pushToMain(main: EditorView, update: ViewUpdate) {
  const open = openCellOf(main.state);
  const table = open && openTable(main.state, open);
  if (!open || !table) return;
  const text = docText(main.state);
  const range = cellRange(text, table, open);
  const changes: ChangeSpec[] = [];
  let cellFrom: number;
  if (range) {
    update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => changes.push({ from: range.from + fromA, to: range.from + toA, insert: inserted.toString() }));
    cellFrom = range.from;
  } else {
    // その行に書いていないセル: 足りない | を足して書く
    const filled = fillMissingCell(text, bodyRows(table)[open.row], open.col, update.state.doc.toString());
    changes.push(filled.change);
    cellFrom = filled.cellFrom;
  }
  const userEvent = update.transactions.map((t) => t.annotation(Transaction.userEvent)).find(Boolean);
  const annotations = [fromCell.of(true), ...(userEvent ? [Transaction.userEvent.of(userEvent)] : [])];
  const sel = update.state.selection.main;
  const first = main.state.update({ changes });
  const later = isAlignedTable(text, table) ? alignAfter(first.state, open) : [];
  // そろえたあとのセルの頭（同じ行の左のセルの幅が変わると動く）
  const finalState = later.length ? first.state.update({ changes: later }).state : first.state;
  const finalRange = openCellRange(finalState, open);
  const base = finalRange ? finalRange.from : cellFrom;
  main.dispatch(
    main.state.update(
      { changes, annotations },
      { changes: later, sequential: true, selection: { anchor: base + sel.anchor, head: base + sel.head }, scrollIntoView: false },
    ),
  );
}

function alignAfter(state: EditorState, open: { tableFrom: number; row: number; col: number }) {
  const table = openTable(state, open);
  return table ? alignTableChanges(docText(state), table) : [];
}

/** セルの部品の選んだ範囲を、本体の選んだ範囲にも写す（選んだ行をチャットに追加・右クリックのメニューが本体を読むため） */
function mirrorSelection(main: EditorView, update: ViewUpdate) {
  const open = openCellOf(main.state);
  const range = open && openCellRange(main.state, open);
  if (!range) return;
  const sel = update.state.selection.main;
  main.dispatch({ selection: { anchor: range.from + sel.anchor, head: range.from + sel.head }, annotations: fromCell.of(true) });
}

/** 開いているセルの中に書く部品を作る（中身は本体のそのセルの元の文字。足りないセルは空） */
export function createCellEditor(main: EditorView, parent: HTMLElement): EditorView {
  const open = openCellOf(main.state);
  const range = open && openCellRange(main.state, open);
  const text = range ? main.state.sliceDoc(range.from, range.to) : "";
  const sel = main.state.selection.main;
  const local = (pos: number) => (range && pos >= range.from && pos <= range.to ? pos - range.from : text.length);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      selection: { anchor: local(sel.anchor), head: local(sel.head) },
      extensions: [
        EditorView.lineWrapping,
        // ピントが ⌘F の欄にあっても、当たった文字を選んだ範囲として見せる
        drawSelection(),
        EditorView.contentAttributes.of({ "aria-label": "表のセル" }),
        keymap.of([
          ...cellKeymap(main),
          // 保存・検索・元に戻すは本体のキーで動かす
          { any: (_v, e) => (e.metaKey || e.ctrlKey) && !e.altKey && FORWARDED_KEYS.has(e.key.toLowerCase()) && runScopeHandlers(main, e, "editor") },
          ...defaultKeymap,
        ]),
        // 打った | と貼った改行は、表の形を壊さない書き方に
        EditorView.inputHandler.of((v, from, to, typed) => {
          const escaped = escapeCellInput(typed);
          if (escaped === typed) return false;
          v.dispatch({ changes: { from, to, insert: escaped }, selection: { anchor: from + escaped.length }, userEvent: "input.type" });
          return true;
        }),
        EditorView.clipboardInputFilter.of((pasted) => escapeCellInput(pasted)),
        EditorView.updateListener.of((u) => {
          const synced = u.transactions.some((t) => t.annotation(fromMain));
          if (u.docChanged && !synced) pushToMain(main, u);
          else if (u.selectionSet && !synced) mirrorSelection(main, u);
          if (u.focusChanged) syncEditorFocus(main);
          if (u.heightChanged || u.geometryChanged) main.requestMeasure();
        }),
      ],
    }),
  });
  editorsByMain.set(main, view);
  // 検索・行へ移るで開いたセルが見えるように（大きな表では、表の頭だけが見えていることがある）
  requestAnimationFrame(() => parent.isConnected && parent.scrollIntoView({ block: "nearest" }));
  const active = document.activeElement;
  // 押した・キーで動いたとき、ピントが編集の部品の中にあったとき（元に戻すなど）にピントを移す。⌘F の欄からは奪わない
  if (takeFocusRequest(main) || (!active?.closest(".cm-panels") && (active === document.body || main.dom.contains(active)))) view.focus();
  return view;
}

/** セルの部品を外す（開いているセルが替わった・閉じた） */
export function destroyCellEditor(main: EditorView, view: EditorView) {
  if (editorsByMain.get(main) === view) editorsByMain.delete(main);
  view.destroy();
}

/** 本体がほかから変わったら、開いているセルの部品へ写す（中身と、選んだ範囲がセルの中ならその範囲） */
export const cellSync = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {}
    update(u: ViewUpdate) {
      const cell = editorsByMain.get(this.view);
      // セルを開いている間に本体がピントを得たら（表の余白を押したなど）、セルへ戻す（本体の Tab が表の文字を字下げしないように）
      if (cell && u.focusChanged && this.view.hasFocus) queueMicrotask(() => editorsByMain.get(this.view) === cell && cell.focus());
      if (!cell || u.transactions.every((t) => t.annotation(fromCell))) return;
      const open = openCellOf(u.state);
      const range = open && openCellRange(u.state, open);
      const text = range ? u.state.sliceDoc(range.from, range.to) : "";
      const sel = u.state.selection.main;
      const inside = range && sel.from >= range.from && sel.to <= range.to;
      const selection = inside ? { anchor: sel.anchor - range.from, head: sel.head - range.from } : undefined;
      const changed = text !== cell.state.doc.toString();
      if (!changed && !selection) return;
      // 本体の書き換えの中では、別の部品へ dispatch できないので後に回す
      queueMicrotask(() => {
        if (editorsByMain.get(this.view) !== cell) return;
        cell.dispatch({ changes: changed ? { from: 0, to: cell.state.doc.length, insert: text } : undefined, selection, annotations: fromMain.of(true) });
      });
    }
  },
);
