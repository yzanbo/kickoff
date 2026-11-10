import { readFindOptions, subscribeFindOptions, writeFindOption } from "@/hooks/useFindOptions";
import type * as monaco from "./monacoEditor";

/** Monaco の検索の様子（公開の型にないので、使う所だけ） */
export interface MonacoFindState {
  readonly searchString: string;
  readonly replaceString: string;
  readonly isRevealed: boolean;
  readonly isReplaceRevealed: boolean;
  /** 一致の数（上限 MONACO_MATCHES_LIMIT で数えるのをやめる） */
  readonly matchesCount: number;
  /** いま選んでいる一致が何番目か（1 から。選んでいなければ 0） */
  readonly matchesPosition: number;
  readonly matchCase: boolean;
  readonly wholeWord: boolean;
  readonly isRegex: boolean;
  change(
    next: { searchString?: string; replaceString?: string; isRevealed?: boolean; isReplaceRevealed?: boolean; matchCase?: boolean; wholeWord?: boolean; isRegex?: boolean },
    moveCursor: boolean,
  ): void;
  onFindReplaceStateChange(listener: (e: Record<string, boolean | undefined>) => void): { dispose(): void };
}

/** Monaco の検索の操作（editor.contrib.findController。公開の型にないので、使う所だけ） */
export interface MonacoFindController extends monaco.editor.IEditorContribution {
  getState(): MonacoFindState;
  /** 検索を始める（一致を探す仕組みを作る。選んでいる 1 行の文を入れる） */
  start(opts: {
    forceRevealReplace: boolean;
    seedSearchStringFromSelection: "none" | "single" | "multiple";
    seedSearchStringFromNonEmptySelection: boolean;
    seedSearchStringFromGlobalClipboard: boolean;
    /** 0 = ピントを動かさない（Monaco の検索の欄は使わない） */
    shouldFocus: 0;
    shouldAnimate: boolean;
    updateSearchScope: boolean;
    loop: boolean;
  }): Promise<void>;
  moveToNextMatch(): boolean;
  moveToPrevMatch(): boolean;
  replace(): boolean;
  replaceAll(): boolean;
  closeFindWidget(): void;
}

/** Monaco が一致を数えるのをやめる数（findModel.js の MATCHES_LIMIT） */
export const MONACO_MATCHES_LIMIT = 19999;

export const monacoFindController = (editor: monaco.editor.ICodeEditor) => editor.getContribution<MonacoFindController>("editor.contrib.findController");

/**
 * Monaco の検索の仕組み（MonacoFindBar の欄）の「Aa」「ab」「.*」を、ほかの検索の欄（チャット・ページ・メモ）と同じ値にそろえる（hooks/useFindOptions）。
 * 開いたときに覚えた値を入れ、Monaco の欄で切り替えたら覚え直し、ほかの欄で切り替えたら Monaco にも入れる。戻り値で外す
 */
export function syncMonacoFindOptions(editor: monaco.editor.ICodeEditor): () => void {
  const state = monacoFindController(editor)?.getState();
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
