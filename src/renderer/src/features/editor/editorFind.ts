import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";

// ⌘F で、ページの中のエディタ（ファイルの Monaco・メモの CodeMirror）の検索を開く口。
// Monaco は部品の外から検索を開く手立てがないので、CodeEditor が自分の入れ物（.code-editor）に開き方を置く

const finders = new WeakMap<Element, () => void>();

/** 編集の部品の入れ物 el に、検索の開き方を置く（戻り値で外す） */
export function registerEditorFind(el: Element, open: () => void): () => void {
  finders.set(el, open);
  return () => {
    if (finders.get(el) === open) finders.delete(el);
  };
}

/**
 * root の中の見えているエディタの検索を開く（エディタにピントを移し、Monaco の検索の欄・CodeMirror の検索の欄を出す。
 * 見えている行の外も探せる）。エディタがなければ false（呼ぶ側が、画面の文字を探す欄を出す）
 */
export function openEditorFind(root: HTMLElement): boolean {
  for (const host of root.querySelectorAll<HTMLElement>(".code-editor")) {
    const open = finders.get(host);
    if (open && host.checkVisibility()) {
      open();
      return true;
    }
  }
  for (const el of root.querySelectorAll<HTMLElement>(".cm-editor")) {
    const view = el.checkVisibility() ? EditorView.findFromDOM(el) : null;
    if (view) {
      view.focus();
      openSearchPanel(view);
      return true;
    }
  }
  return false;
}
