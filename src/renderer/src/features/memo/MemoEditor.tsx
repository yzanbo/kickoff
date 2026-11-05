import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { MemoKind } from "@shared/memo/kinds";
import { cx } from "@/lib/cx";
import { livePreview } from "./livePreviewExtension";

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

/** 外から編集の部品を動かす口（右クリックのメニュー。選んだ文を読む・選んだ所に入れる） */
export interface MemoEditorHandle {
  /** 選んでいる文（何も選んでいなければ空） */
  selectedText: () => string;
  /** 選んでいる所を text に置き換える（選んでいなければカーソルの位置に入れる。⌘Z で戻せる） */
  insert: (text: string) => void;
}

interface Props {
  /** 書き始めの中身（作ったときだけ読む。読み直したときは key を変えて作り直す） */
  initialValue: string;
  /** メモの種類（Markdown か HTML か。言語の色分けと Enter の続け方。作ったときだけ読む） */
  kind: MemoKind;
  /** Markdown 表示（Obsidian のライブプレビューと同じ）か、そのまま表示か（Markdown のメモだけ）。切り替えても書いたもの・元に戻す履歴はそのまま */
  live: boolean;
  /** 隠す（HTML のメモをページで見ている間。作り直さずに置いて、書いたもの・元に戻す履歴を残す） */
  hidden?: boolean;
  onChange: (text: string) => void;
  /** ⌘S */
  onSave: () => void;
  /** 外から動かす口を入れる入れ物 */
  handleRef?: MutableRefObject<MemoEditorHandle | null>;
  /** 本文の右クリック（画面の位置。メモの右クリックのメニューを開く） */
  onContextMenu?: (at: { x: number; y: number }) => void;
}

/** HTML のソースの色分け（アプリの色の変数で、ダークでもライトでも読める色に。Markdown のメモには付けない） */
const htmlHighlight = HighlightStyle.define([
  { tag: [tags.tagName, tags.angleBracket], color: "var(--info)" },
  { tag: tags.attributeName, color: "var(--warn)" },
  { tag: [tags.attributeValue, tags.string], color: "var(--ok)" },
  { tag: [tags.propertyName, tags.keyword], color: "var(--accent-text)" },
  { tag: [tags.number, tags.unit, tags.color], color: "var(--warn)" },
  { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
  { tag: tags.documentMeta, color: "var(--muted)" },
]);

/** 選んだ範囲の色（ピントがあってもなくても同じ。drawSelection の層） */
const selectionTheme = EditorView.theme({
  "& .cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "color-mix(in srgb, var(--accent) 28%, transparent)",
  },
});

/**
 * メモの編集（CodeMirror 6）。HTML のメモは HTML のソースをそのまま書く（色分けと、タグを閉じる補助。ページの見た目は MemoView が別に描く）。
 * Markdown のメモの Markdown 表示は、カーソルのある行だけ記号を見せ、ほかの行は見出し・太字・リストなどを整えて見せる
 * （livePreviewExtension。ファイルの中身は書いたとおり）。そのまま表示は記号もそのまま。どちらも書けて、⌘S で保存する。
 * 行を折り返し、Enter でリスト・引用を続ける（lang-markdown の決まり）。大きいので、メモを開いたときに初めて読み込む（default export）
 * 右クリックは自前のメニュー（onContextMenu。チャットに追加・コピーなど）。
 */
export default function MemoEditor({ initialValue, kind, live, hidden = false, onChange, onSave, handleRef, onContextMenu }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [mode] = useState(() => new Compartment());
  // 渡される関数は描くたびに変わるので、いつも最新を呼ぶ
  const handlers = useRef({ onChange, onSave, onContextMenu });
  handlers.current = { onChange, onSave, onContextMenu };

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          // 選んだ範囲を、ピントが外れても（右クリックのメニュー・チャットの欄に移っても）見えるように描く。色は CodeMirror の既定（明るい紫）より
          // 詳細度の高い既定の規則に CSS では勝てないので、テーマで上書きする（アクセントの薄い色。文字が読めるように）
          drawSelection(),
          selectionTheme,
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                handlers.current.onSave();
                return true;
              },
            },
            indentWithTab,
            ...searchKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          // ⌘F でエディタの中を探す（上に検索の欄。見えていない行も探せる）
          search({ top: true }),
          EditorState.phrases.of(SEARCH_PHRASES),
          kind === "html" ? [html(), syntaxHighlighting(htmlHighlight)] : markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": kind === "html" ? "メモ（HTML のソース）" : "メモ" }),
          mode.of(live && kind === "markdown" ? livePreview : []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
          }),
          // 右クリックは自前のメニュー（選んだ範囲はそのまま残す）
          EditorView.domEventHandlers({
            contextmenu: (e) => {
              const open = handlers.current.onContextMenu;
              if (!open) return false;
              e.preventDefault();
              open({ x: e.clientX, y: e.clientY });
              return true;
            },
          }),
        ],
      }),
    });
    view.current = v;
    if (handleRef) {
      handleRef.current = {
        selectedText: () => {
          const { from, to } = v.state.selection.main;
          return v.state.sliceDoc(from, to);
        },
        insert: (text) => {
          v.dispatch(v.state.replaceSelection(text), { scrollIntoView: true, userEvent: "input.paste" });
          v.focus();
        },
      };
    }
    return () => {
      v.destroy();
      view.current = null;
      if (handleRef) handleRef.current = null;
    };
    // 作るのは 1 回だけ（中身を入れ直すときは key を変えて作り直す。表示の切り替えは下の effect）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: mode.reconfigure(live && kind === "markdown" ? livePreview : []) });
  }, [live, kind, mode]);

  return <div ref={host} hidden={hidden} className={cx("md-editor", live && kind === "markdown" ? "live" : "source")} />;
}
