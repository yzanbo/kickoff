import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { MySQL, PostgreSQL, SQLite, sql, type SQLNamespace } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef, type MutableRefObject } from "react";
import type { DbEngine } from "@shared/types";

/** SQL の色分け（アプリの色の変数で、ダークでもライトでも読める色に） */
const sqlHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--accent-fg)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--ok)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--warn)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--muted)", fontStyle: "italic" },
  { tag: [tags.typeName, tags.standard(tags.name)], color: "var(--info)" },
  { tag: tags.operator, color: "var(--fg-muted, var(--muted))" },
]);

const DIALECTS = { sqlite: SQLite, postgres: PostgreSQL, mysql: MySQL } as const;

/** 外から編集の部品を動かす口（流す文を決めるため、文と選んだ範囲・カーソルを読む） */
export interface SqlEditorHandle {
  text: () => string;
  /** 選んでいる範囲（なければ null）とカーソルの位置 */
  selection: () => { from: number; to: number; empty: boolean };
  focus: () => void;
}

/**
 * SQL のタブの入力欄（CodeMirror ＋ テーブル名・列名の補完）。⌘↵ で onRun、⇧⌘↵ で onRunAll（どちらも入力欄にピントがあるとき）。
 * schema は補完に使うテーブル → 列の名前（届いたら差し替える）。initialValue は作ったときだけ読む
 */
export function SqlEditor({
  engine,
  initialValue,
  schema,
  onChange,
  onRun,
  onRunAll,
  handleRef,
}: {
  engine: DbEngine;
  initialValue: string;
  schema: SQLNamespace | undefined;
  onChange: (text: string) => void;
  onRun: () => void;
  onRunAll: () => void;
  handleRef: MutableRefObject<SqlEditorHandle | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const language = useRef(new Compartment());
  // 押したときの処理は最新のものを呼ぶ（作り直さない）
  const handlers = useRef({ onChange, onRun, onRunAll });
  handlers.current = { onChange, onRun, onRunAll };

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          drawSelection(),
          placeholder("SQL を書いて ⌘↵ で流します（⇧⌘↵ ですべての文）"),
          language.current.of(sql({ dialect: DIALECTS[engine], schema, upperCaseKeywords: false })),
          syntaxHighlighting(sqlHighlight),
          autocompletion({ activateOnTyping: true }),
          Prec.highest(
            keymap.of([
              { key: "Mod-Enter", run: () => (handlers.current.onRun(), true) },
              { key: "Shift-Mod-Enter", run: () => (handlers.current.onRunAll(), true) },
            ]),
          ),
          keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((u) => u.docChanged && handlers.current.onChange(u.state.doc.toString())),
          EditorView.lineWrapping,
        ],
      }),
    });
    view.current = editor;
    handleRef.current = {
      text: () => editor.state.doc.toString(),
      selection: () => {
        const r = editor.state.selection.main;
        return { from: r.from, to: r.to, empty: r.empty };
      },
      focus: () => editor.focus(),
    };
    return () => {
      editor.destroy();
      view.current = null;
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 補完のテーブル・列が届いたら差し替える
  useEffect(() => {
    view.current?.dispatch({ effects: language.current.reconfigure(sql({ dialect: DIALECTS[engine], schema, upperCaseKeywords: false })) });
  }, [engine, schema]);

  return <div ref={host} className="db-sql-editor" />;
}
