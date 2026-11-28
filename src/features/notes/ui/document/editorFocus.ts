// 編集の部品のどこにピントがあるかを持つ StateField と、その見張り（Markdown 表示の飾りと表のセルが共通に読む。使う拡張がそれぞれ入れる）。
// inside はピントのある要素が本体の中か（本文・セルの書く部品・⌘F の欄・リンクの小窓。セルの部品にピントが移ると本体は hasFocus を失うため、要素で決める）。
// text は本体の本文にピントがあるか（view.hasFocus）
import { StateEffect, StateField, type EditorState } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";

export interface EditorFocus {
  inside: boolean;
  text: boolean;
}

const NONE: EditorFocus = { inside: false, text: false };

/** ピントの様子が変わった（見張りが送る） */
export const editorFocusEffect = StateEffect.define<EditorFocus>();

const editorFocusField = StateField.define<EditorFocus>({
  create: () => NONE,
  update: (value, tr) => tr.effects.reduce((v, e) => (e.is(editorFocusEffect) ? e.value : v), value),
});

/** いまのピントの様子（見張りを入れていなければ、どこにもない） */
export const editorFocusOf = (state: EditorState): EditorFocus => state.field(editorFocusField, false) ?? NONE;

/**
 * ピントの様子を読み直して伝える（本体とセルの書く部品のピントが変わったとき）。変わっていなくても送る
 * （表の状態は、セルを開いた時点でピントが中にある扱いにするので、外にあると知らせ直してセルを閉じさせる）
 */
export function syncEditorFocus(view: EditorView) {
  queueMicrotask(() => view.dispatch({ effects: editorFocusEffect.of({ inside: view.dom.contains(document.activeElement), text: view.hasFocus }) }));
}

const focusWatcher = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {}
    update(u: ViewUpdate) {
      if (u.focusChanged) syncEditorFocus(this.view);
    }
  },
);

/** ピントの様子と見張り（同じ物なので、いくつの拡張が入れても 1 つ） */
export const editorFocus = [editorFocusField, focusWatcher];
