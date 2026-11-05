import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
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

interface Props {
  /** 書き始めの中身（作ったときだけ読む。読み直したときは key を変えて作り直す） */
  initialValue: string;
  /** Markdown 表示（Obsidian のライブプレビューと同じ）か、そのまま表示か。切り替えても書いたもの・元に戻す履歴はそのまま */
  live: boolean;
  onChange: (text: string) => void;
  /** ⌘S */
  onSave: () => void;
}

/**
 * メモの編集（CodeMirror 6）。Markdown 表示は、カーソルのある行だけ記号を見せ、ほかの行は見出し・太字・リストなどを整えて見せる
 * （livePreviewExtension。ファイルの中身は書いたとおり）。そのまま表示は記号もそのまま。どちらも書けて、⌘S で保存する。
 * 行を折り返し、Enter でリスト・引用を続ける（lang-markdown の決まり）。大きいので、メモを開いたときに初めて読み込む（default export）
 */
export default function MarkdownEditor({ initialValue, live, onChange, onSave }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [mode] = useState(() => new Compartment());
  // 渡される関数は描くたびに変わるので、いつも最新を呼ぶ
  const handlers = useRef({ onChange, onSave });
  handlers.current = { onChange, onSave };

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
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
          EditorView.updateListener.of((u) => {
            if (u.docChanged) handlers.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // 作るのは 1 回だけ（中身を入れ直すときは key を変えて作り直す。表示の切り替えは下の effect）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: mode.reconfigure(live ? livePreview : []) });
  }, [live, mode]);

  return <div ref={host} className={cx("md-editor", live ? "live" : "source")} />;
}
