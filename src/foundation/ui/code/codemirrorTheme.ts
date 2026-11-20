import { EditorView } from "@codemirror/view";

/**
 * アプリの CodeMirror の共通の見た目（useCodeMirror がいつも足す）: 置き場所の高さいっぱい・ピントの枠なし（欄の枠で示す）・入力の印は文字の色。
 * 余白・文字・行の高さ・色分けは使う所で決める（実行時に差す style より強くするので、CSS なら層の外の *.unlayered.css）
 */
export const appEditorTheme = EditorView.theme({
  "&": { height: "100%" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": { caretColor: "var(--text)" },
});
