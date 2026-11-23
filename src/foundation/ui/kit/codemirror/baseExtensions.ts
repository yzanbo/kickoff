import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap, type KeyBinding } from "@codemirror/view";
import { readFindOptions } from "@/foundation/ui/hooks/useFindOptions";
import { codeSearchConfig, createCodeFindPanel } from "./codeFindPanel";

/** 検索の欄の文言（CodeMirror の英語を、アプリの言い方にそろえる） */
const SEARCH_PHRASES: Record<string, string> = {
  Find: "検索",
  Replace: "置き換え",
  next: "次へ",
  previous: "前へ",
  all: "すべて",
  "match case": "大文字・小文字を区別",
  regexp: "正規表現",
  "by word": "単語単位",
  replace: "置き換え",
  "replace all": "すべて置き換え",
  close: "閉じる",
  "current match": "いまの一致",
  "replaced match": "置き換えた一致",
  "replaced $ matches": "$ 件を置き換えました",
  "on line": "行",
};

/** 選んだ範囲の色（ピントがあってもなくても同じ。drawSelection の層） */
const selectionTheme = EditorView.theme({
  "& .cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "color-mix(in srgb, var(--accent) 28%, transparent)",
  },
});

/**
 * アプリの CodeMirror のエディタ（ノート・SQL）に共通の拡張: 元に戻す履歴・選んだ範囲の描き方と色・キー（Tab で字下げ・既定・履歴・検索）・
 * ⌘F の検索の欄（codeFindPanel。本文の右上に浮かせる。見た目は styles/ui/code-find.unlayered.css）・検索の欄の日本語の文言。
 * onSave を渡せば ⌘S で呼ぶ。findPlaceholder は検索の欄の薄い文。使う側の keymap を先に並べれば、そちらが勝つ
 */
export function baseExtensions({ findPlaceholder, onSave }: { findPlaceholder: string; onSave?: () => void }): Extension {
  const save: KeyBinding[] = onSave
    ? [
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            onSave();
            return true;
          },
        },
      ]
    : [];
  return [
    history(),
    // 選んだ範囲を、ピントが外れても（右クリックのメニュー・チャットの欄に移っても）見えるように描く。色は CodeMirror の既定（明るい紫）より
    // 詳細度の高い既定の規則に CSS では勝てないので、テーマで上書きする（アクセントの薄い色。文字が読めるように）
    drawSelection(),
    selectionTheme,
    keymap.of([...save, indentWithTab, ...searchKeymap, ...defaultKeymap, ...historyKeymap]),
    // ⌘F でエディタの中を探す（上に検索の欄。見えていない行も探せる）。欄はページ・チャットの検索と同じ見た目と探し方
    search({ top: true, createPanel: (view) => createCodeFindPanel(view, findPlaceholder), ...codeSearchConfig(readFindOptions()) }),
    EditorState.phrases.of(SEARCH_PHRASES),
    EditorView.editorAttributes.of({ class: "code-find-editor" }),
  ];
}
