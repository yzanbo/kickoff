import { closeSearchPanel, findNext, findPrevious, getSearchQuery, replaceAll, replaceNext, SearchQuery, setSearchQuery } from "@codemirror/search";
import type { EditorState } from "@codemirror/state";
import { runScopeHandlers, type EditorView, type Panel, type ViewUpdate } from "@codemirror/view";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { useFindOptions } from "@/hooks/useFindOptions";
import type { FindOptions } from "@/lib/textFind";
import { FindField, findCountText } from "@/ui/FindField";

/** 数える一致の上限（大きなメモで打つたびに数えすぎない） */
const MAX_COUNT = 10_000;

/** エディタごとの置き換えの行（閉じて開き直しても、開いているか・書いた文を残す。VS Code と同じ） */
const replaceMemory = new WeakMap<EditorView, { open: boolean; text: string }>();

/** 打った文・置き換える文と探し方から、CodeMirror の検索の形を作る（正規表現でなければ打ったまま。\n も文字のまま） */
function memoSearchQuery(search: string, replace: string, options: FindOptions): SearchQuery {
  return new SearchQuery({ search, replace, ...memoSearchConfig(options) });
}

/** 初めて開くときの検索の形（search() の設定。開いたあとは欄が探し方をそろえる） */
export function memoSearchConfig(options: FindOptions) {
  return { caseSensitive: options.caseSensitive, wholeWord: options.wholeWord, regexp: options.regex, literal: !options.regex };
}

/** いまの検索の一致の数と、選んでいる所が何番目か（選んでいる所が一致でなければ null） */
function countMatches(state: EditorState): { total: number; current: number | null; capped: boolean } {
  const query = getSearchQuery(state);
  if (!query.valid || !query.search) return { total: 0, current: null, capped: false };
  const sel = state.selection.main;
  const cursor = query.getCursor(state);
  let total = 0;
  let current: number | null = null;
  for (let r = cursor.next(); !r.done; r = cursor.next()) {
    if (r.value.from === sel.from && r.value.to === sel.to) current = total;
    total += 1;
    if (total >= MAX_COUNT) return { total, current, capped: true };
  }
  return { total, current, capped: false };
}

/**
 * メモのエディタ（CodeMirror）の ⌘F の検索の欄。ほかの検索の欄と同じ部品（ui/FindField）・探し方（「Aa」「ab」「.*」。useFindOptions）で、
 * 本文の右上に浮かせる（.memo-find）。VS Code と同じく左の ▸ で置き換えの行を開く（Enter で 1 つ、⌘Enter ですべて置き換える）。
 * 検索の欄の中のキー（Esc で閉じる・⌘G で次へなど）は CodeMirror の検索の欄と同じ（searchKeymap の search-panel）
 */
function MemoFindPanel({ view, initialFocus }: { view: EditorView; initialFocus: boolean }) {
  const { options, toggle } = useFindOptions();
  const query = getSearchQuery(view.state);
  const [text, setText] = useState(query.search);
  const remembered = replaceMemory.get(view);
  const [replace, setReplaceState] = useState(remembered?.text ?? query.replace);
  const [replaceOpen, setReplaceOpenState] = useState(remembered?.open ?? false);
  const setReplace = (text: string) => {
    setReplaceState(text);
    replaceMemory.set(view, { open: replaceOpen, text });
  };
  const setReplaceOpen = (open: boolean) => {
    setReplaceOpenState(open);
    replaceMemory.set(view, { open, text: replace });
  };
  const searchRef = useRef<HTMLInputElement>(null);
  // 最後に CodeMirror へ渡した文（ほかから変わった（⌘F で選んでいる文を入れた）ときだけ、欄を合わせる）
  const pushed = useRef(query.search);
  if (query.search !== pushed.current) {
    pushed.current = query.search;
    setText(query.search);
  }

  const push = (search: string, replaceText: string, opts: FindOptions) => {
    pushed.current = search;
    view.dispatch({ effects: setSearchQuery.of(memoSearchQuery(search, replaceText, opts)) });
  };

  // CodeMirror の検索の形を、欄の探し方・置き換える文にそろえる（探し方をほかの検索の欄で切り替えたとき・開いたとき。
  // ⌘F で開き直すと CodeMirror は置き換える文を空にした形を入れるので、そのときも欄の文に戻す）。
  // 開いた直後は CodeMirror の更新の途中なので、そこで dispatch しないよう一拍おく
  useEffect(() => {
    queueMicrotask(() => {
      const q = getSearchQuery(view.state);
      if (q.caseSensitive !== options.caseSensitive || q.wholeWord !== options.wholeWord || q.regexp !== options.regex || q.replace !== replace) push(q.search, replace, options);
    });
  });

  useEffect(() => {
    if (!initialFocus) return;
    searchRef.current?.focus();
    searchRef.current?.select();
  }, [initialFocus]);

  const { total, current, capped } = countMatches(view.state);
  const invalid = Boolean(text) && !query.valid;

  // 検索の欄の中のキー（Esc で閉じる・⌘G で次へなど）は CodeMirror の検索の欄と同じ（searchKeymap の search-panel）
  const scopeKeys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!runScopeHandlers(view, e.nativeEvent, "search-panel")) return false;
    e.preventDefault();
    // パネル・右の欄を閉じる Esc に渡さない
    e.stopPropagation();
    return true;
  };

  return (
    <FindField
      inputRef={searchRef}
      value={text}
      onChange={(v) => {
        setText(v);
        push(v, replace, options);
      }}
      placeholder="このメモを検索"
      inputProps={{ "main-field": "true" }}
      invalid={invalid}
      options={options}
      onToggleOption={toggle}
      count={findCountText({ invalid, query: text, total, current, capped })}
      canStep={total > 0}
      onStep={(step) => (step === 1 ? findNext : findPrevious)(view)}
      onClose={() => closeSearchPanel(view)}
      onKeyDown={scopeKeys}
      replace={{
        open: replaceOpen,
        onOpenChange: setReplaceOpen,
        value: replace,
        onChange: (v) => {
          setReplace(v);
          push(text, v, options);
        },
        onReplace: () => replaceNext(view),
        onReplaceAll: () => replaceAll(view),
        canReplace: total > 0,
      }}
      className="memo-find"
    />
  );
}

/** CodeMirror の search({ createPanel }) に渡す、検索の欄の作り方（中を React で描く） */
export function createMemoFindPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "find-panel-host";
  const root = createRoot(dom);
  const render = (initialFocus: boolean) => root.render(<MemoFindPanel view={view} initialFocus={initialFocus} />);
  return {
    dom,
    top: true,
    // 開いたらすぐ欄にピントを置く（openSearchPanel は、初めて開くときは欄を探して focus しないので、ここで描き切ってから置く）
    mount: () => flushSync(() => render(true)),
    // 文・選んでいる所・検索の形が変わったら描き直す（件数と何番目か）
    update: (u: ViewUpdate) => {
      if (u.docChanged || u.selectionSet || u.transactions.some((tr) => tr.effects.some((e) => e.is(setSearchQuery)))) render(false);
    },
    // CodeMirror の更新の途中で React の木を外さない
    destroy: () => void queueMicrotask(() => root.unmount()),
  };
}
