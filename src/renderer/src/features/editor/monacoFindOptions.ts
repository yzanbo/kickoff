import { readFindOptions, subscribeFindOptions, writeFindOption } from "@/hooks/useFindOptions";
import type * as monaco from "./monacoEditor";

/** Monaco の検索の欄の様子（公開の型にないので、使う所だけ） */
interface MonacoFindState {
  readonly matchCase: boolean;
  readonly wholeWord: boolean;
  readonly isRegex: boolean;
  change(next: { matchCase?: boolean; wholeWord?: boolean; isRegex?: boolean }, moveCursor: boolean): void;
  onFindReplaceStateChange(listener: (e: { matchCase?: boolean; wholeWord?: boolean; isRegex?: boolean }) => void): { dispose(): void };
}

/**
 * Monaco の検索の欄の「Aa」「ab」「.*」を、ほかの検索の欄（チャット・ページ・メモ）と同じ値にそろえる（hooks/useFindOptions）。
 * 開いたときに覚えた値を入れ、Monaco の欄で切り替えたら覚え直し、ほかの欄で切り替えたら Monaco にも入れる。戻り値で外す
 */
export function syncMonacoFindOptions(editor: monaco.editor.ICodeEditor): () => void {
  const state = editor.getContribution<monaco.editor.IEditorContribution & { getState(): MonacoFindState }>("editor.contrib.findController")?.getState();
  if (!state) return () => {};
  const apply = () => {
    const o = readFindOptions();
    if (state.matchCase !== o.caseSensitive || state.wholeWord !== o.wholeWord || state.isRegex !== o.regex) {
      state.change({ matchCase: o.caseSensitive, wholeWord: o.wholeWord, isRegex: o.regex }, false);
    }
  };
  apply();
  const sub = state.onFindReplaceStateChange((e) => {
    if (e.matchCase) writeFindOption("caseSensitive", state.matchCase);
    if (e.wholeWord) writeFindOption("wholeWord", state.wholeWord);
    if (e.isRegex) writeFindOption("regex", state.isRegex);
  });
  const off = subscribeFindOptions(apply);
  return () => {
    sub.dispose();
    off();
  };
}
