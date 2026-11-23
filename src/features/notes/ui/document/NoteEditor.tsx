import "./NoteEditor.unlayered.css";
import "./NoteEditor.css";
import { html } from "@codemirror/lang-html";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { EditorView } from "@codemirror/view";
import type { MutableRefObject } from "react";
import type { NoteKind } from "@shared/notes/kinds";
import { useCodeMirror } from "@/foundation/ui/hooks/useCodeMirror";
import { baseExtensions } from "@/foundation/ui/kit/codemirror/baseExtensions";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { cx } from "@/foundation/ui/lib/cx";
import { livePreview } from "./livePreviewExtension";
import { liveRich } from "./liveRich";
import type { NoteLines } from "./noteAttachment";

/** 外から編集の部品を動かす口（右クリックのメニュー。選んだ文を読む・選んだ所に入れる） */
export interface NoteEditorHandle {
  /** 選んでいる文（何も選んでいなければ空） */
  selectedText: () => string;
  /** 選んでいる行（何も選んでいなければ null） */
  selectedLines: () => NoteLines | null;
  /** 選んでいる範囲の画面の位置（本文にピントがあって選んでいるときだけ。上に「チャットに追加」を出す） */
  selectionRect: () => { left: number; top: number; width: number } | null;
  /** 選んでいる所を text に置き換える（選んでいなければカーソルの位置に入れる。⌘Z で戻せる） */
  insert: (text: string) => void;
  /** その行（1 から）を選んで真ん中に見せる（⌘K の「ノート内の文言」から開いたとき。行が足りなければ最後の行） */
  revealLine: (line: number) => void;
}

interface Props {
  /** 書き始めの中身（作ったときだけ読む。読み直したときは key を変えて作り直す） */
  initialValue: string;
  /** ノートの種類（Markdown か HTML か。言語の色分けと Enter の続け方。作ったときだけ読む） */
  kind: NoteKind;
  /** Markdown 表示（Obsidian のライブプレビューと同じ）か、そのまま表示か（Markdown のノートだけ）。切り替えても書いたもの・元に戻す履歴はそのまま */
  live: boolean;
  /** 隠す（HTML のノートをページで見ている間。作り直さずに置いて、書いたもの・元に戻す履歴を残す） */
  hidden?: boolean;
  onChange: (text: string) => void;
  /** ⌘S */
  onSave: () => void;
  /** 外から動かす口を入れる入れ物 */
  handleRef?: MutableRefObject<NoteEditorHandle | null>;
  /** 本文の右クリック（画面の位置。ノートの右クリックのメニューを開く） */
  onContextMenu?: (at: { x: number; y: number }) => void;
  /** 作り終えた（外から動かす口が使えるようになった。頼まれていた行へ移るのに使う） */
  onReady?: () => void;
}

/** HTML のソースの色分け（アプリの色の変数で、ダークでもライトでも読める色に。Markdown のノートには付けない） */
const htmlHighlight = HighlightStyle.define([
  { tag: [tags.tagName, tags.angleBracket], color: "var(--info)" },
  { tag: tags.attributeName, color: "var(--warn)" },
  { tag: [tags.attributeValue, tags.string], color: "var(--ok)" },
  { tag: [tags.propertyName, tags.keyword], color: "var(--accent-text)" },
  { tag: [tags.number, tags.unit, tags.color], color: "var(--warn)" },
  { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
  { tag: tags.documentMeta, color: "var(--muted)" },
]);

/**
 * ノートの編集（CodeMirror 6）。HTML のノートは HTML のソースをそのまま書く（色分けと、タグを閉じる補助。ページの見た目は NoteView が別に描く）。
 * Markdown のノートの Markdown 表示は、カーソルのある行だけ記号を見せ、ほかの行は見出し・太字・リストなどを整えて見せる
 * （livePreviewExtension。ファイルの中身は書いたとおり）。そのまま表示は記号もそのまま。どちらも書けて、⌘S で保存する。
 * 行を折り返し、Enter でリスト・引用を続ける（lang-markdown の決まり）。大きいので、ノートを開いたときに初めて読み込む（default export）
 * 右クリックは自前のメニュー（onContextMenu。チャットに追加・コピーなど）。
 */
export default function NoteEditor({ initialValue, kind, live, hidden = false, onChange, onSave, handleRef, onContextMenu, onReady }: Props) {
  // 渡される関数は描くたびに変わるので、いつも最新を呼ぶ
  const handlers = useLatest({ onSave, onContextMenu });

  const { host } = useCodeMirror({
    initialValue,
    onChange,
    // 表示の切り替え（Markdown の表示 / そのまま）は作り直さずに差し替える
    dynamic: live && kind === "markdown" ? [liveRich, livePreview] : [],
    dynamicDeps: [live, kind],
    extensions: () => [
      baseExtensions({ findPlaceholder: "このノートを検索", onSave: () => handlers.current.onSave() }),
      kind === "html" ? [html(), syntaxHighlighting(htmlHighlight)] : markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": kind === "html" ? "ノート（HTML のソース）" : "ノート" }),
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
    onCreate: (v) => {
      if (!handleRef) return;
      handleRef.current = {
        selectedText: () => {
          const { from, to } = v.state.selection.main;
          return v.state.sliceDoc(from, to);
        },
        selectedLines: () => {
          const { from, to } = v.state.selection.main;
          if (from === to) return null;
          // 次の行の頭で終わる選び方なら、その行は数えない
          return { from: v.state.doc.lineAt(from).number, to: v.state.doc.lineAt(to - 1).number };
        },
        selectionRect: () => {
          const { from, to } = v.state.selection.main;
          if (from === to || !v.hasFocus) return null;
          const start = v.coordsAtPos(from, 1);
          const end = v.coordsAtPos(to, -1);
          if (!start) return null;
          // 1 行の中なら選んだ幅の真ん中、行をまたげば選び始めの上
          return { left: start.left, top: start.top, width: end && end.top === start.top ? end.left - start.left : 0 };
        },
        insert: (text) => {
          v.dispatch(v.state.replaceSelection(text), { scrollIntoView: true, userEvent: "input.paste" });
          v.focus();
        },
        revealLine: (line) => {
          const target = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines));
          v.dispatch({ selection: { anchor: target.from, head: target.to }, effects: EditorView.scrollIntoView(target.from, { y: "center" }) });
          v.focus();
        },
      };
      onReady?.();
      return () => {
        handleRef.current = null;
      };
    },
  });

  return <div ref={host} hidden={hidden} className={cx("md-editor", live && kind === "markdown" ? "live" : "source")} />;
}
