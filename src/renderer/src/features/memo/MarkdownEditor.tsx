import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, StateField } from "@codemirror/state";
import { drawSelection, EditorView, keymap, showTooltip, type Tooltip } from "@codemirror/view";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
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

/** 外から編集の部品を動かす口（メモの AI の整理。選んだ範囲を読む・範囲を置き換える） */
export interface MemoEditorHandle {
  /** いま書いてある中身 */
  text: () => string;
  /** 選んでいる範囲（何も選んでいなければ null） */
  selection: () => { from: number; to: number; text: string } | null;
  /** 選んでいる範囲の最初と最後の行の要素（頼みの欄を、選んだ文を隠さない所に出すため。選んでいなければ null） */
  selectionLines: () => { first: HTMLElement; last: HTMLElement } | null;
  /**
   * from〜to を text に置き換え、置き換えた範囲を選ぶ（元に戻す ⌘Z で戻せる）。その範囲がもう expected でなければ（あとから書き換えた）置き換えずに false
   */
  replace: (from: number, to: number, expected: string, text: string) => boolean;
}

interface Props {
  /** 書き始めの中身（作ったときだけ読む。読み直したときは key を変えて作り直す） */
  initialValue: string;
  /** Markdown 表示（Obsidian のライブプレビューと同じ）か、そのまま表示か。切り替えても書いたもの・元に戻す履歴はそのまま */
  live: boolean;
  onChange: (text: string) => void;
  /** ⌘S */
  onSave: () => void;
  /** 外から動かす口を入れる入れ物 */
  handleRef?: MutableRefObject<MemoEditorHandle | null>;
  /** 範囲を選んだときに、その上に出す「AI で直す」を押した（anchor は押したボタン。その場所から頼みの欄を開く）。なければ出さない */
  onAskAi?: (anchor: HTMLElement) => void;
}

/**
 * メモの編集（CodeMirror 6）。Markdown 表示は、カーソルのある行だけ記号を見せ、ほかの行は見出し・太字・リストなどを整えて見せる
 * （livePreviewExtension。ファイルの中身は書いたとおり）。そのまま表示は記号もそのまま。どちらも書けて、⌘S で保存する。
 * 行を折り返し、Enter でリスト・引用を続ける（lang-markdown の決まり）。大きいので、メモを開いたときに初めて読み込む（default export）
 */
/** 選んだ範囲の色（ピントがあってもなくても同じ。drawSelection の層） */
const selectionTheme = EditorView.theme({
  "& .cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "color-mix(in srgb, var(--accent) 28%, transparent)",
  },
});

export default function MarkdownEditor({ initialValue, live, onChange, onSave, handleRef, onAskAi }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [mode] = useState(() => new Compartment());
  // 渡される関数は描くたびに変わるので、いつも最新を呼ぶ
  const handlers = useRef({ onChange, onSave, onAskAi });
  handlers.current = { onChange, onSave, onAskAi };

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          // 選んだ範囲を、ピントが外れても（AI の頼みの欄を書いている間も）見えるように描く。色は CodeMirror の既定（明るい紫）より
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
          markdown({ base: markdownLanguage }),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "メモ" }),
          mode.of(live ? livePreview : []),
          ...(onAskAi ? [askAiTooltip(() => handlers.current.onAskAi)] : []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    if (handleRef) {
      handleRef.current = {
        text: () => v.state.doc.toString(),
        selection: () => {
          const { from, to } = v.state.selection.main;
          return from === to ? null : { from, to, text: v.state.sliceDoc(from, to) };
        },
        selectionLines: () => {
          const { from, to, empty } = v.state.selection.main;
          if (empty) return null;
          const lineAt = (pos: number) => {
            const { node } = v.domAtPos(pos);
            return (node instanceof HTMLElement ? node : node.parentElement)?.closest<HTMLElement>(".cm-line") ?? null;
          };
          const first = lineAt(from);
          const last = lineAt(to);
          return first && last ? { first, last } : null;
        },
        replace: (from, to, expected, text) => {
          if (to > v.state.doc.length || v.state.sliceDoc(from, to) !== expected) return false;
          v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from, head: from + text.length }, scrollIntoView: true, userEvent: "input.ai" });
          v.focus();
          return true;
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
    view.current?.dispatch({ effects: mode.reconfigure(live ? livePreview : []) });
  }, [live, mode]);

  return <div ref={host} className={cx("md-editor", live ? "live" : "source")} />;
}

/**
 * 範囲を選んでいる間、その上に出す「✨ AI で直す」の吹き出し（押すと、選んだ範囲を直す頼みの欄を開く）。
 * 押しても選択が外れないよう、mousedown の既定の動き（ピントを移す）を止める
 */
function askAiTooltip(handler: () => ((anchor: HTMLElement) => void) | undefined) {
  const tip = (state: EditorState): Tooltip | null => {
    const { from, to, empty } = state.selection.main;
    if (empty || !state.sliceDoc(from, to).trim()) return null;
    return {
      pos: from,
      above: true,
      arrow: false,
      create: () => {
        const dom = document.createElement("div");
        dom.className = "memo-ai-tip";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "memo-ai-tip-button";
        button.textContent = "✨ AI で直す";
        button.title = "選んだ範囲を AI で直す（案を差分で見てから取り込む）";
        button.addEventListener("mousedown", (e) => e.preventDefault());
        button.addEventListener("click", () => handler()?.(button));
        dom.append(button);
        return { dom };
      },
    };
  };
  return StateField.define<Tooltip | null>({
    create: tip,
    update: (value, tr) => (tr.docChanged || tr.selection ? tip(tr.state) : value),
    provide: (field) => showTooltip.from(field),
  });
}
