// CodeMirror 6 の編集の部品を 1 つ作る hook（SQL のタブの入力欄・メモの編集で共通）。
// 作るのは描いたときの 1 回だけ（中身を入れ直すときは key を変えて作り直す）。書き換わったら onChange にいまの文を渡し、
// 途中で変える拡張（言語の補完・表示の切り替え）は dynamic に渡せば、dynamicDeps が変わったときに差し替える
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";

interface Options {
  initialValue: string;
  /** 作るときだけ読む拡張（キー・言語・見た目など） */
  extensions: () => Extension;
  /** 途中で差し替える拡張（省けば何も差し替えない） */
  dynamic?: Extension;
  /** dynamic を差し替えるきっかけの値（変わったら差し替える） */
  dynamicDeps?: readonly unknown[];
  /** 書き換わったときのいまの文（描くたびに変わる関数でよい。いつも最新を呼ぶ） */
  onChange: (text: string) => void;
  /** 作ったあと（外から動かす口を置くなど）。返した関数は壊す前に呼ぶ */
  onCreate?: (view: EditorView) => void | (() => void);
}

/** host を描く要素に付ける。view はいまの部品（壊したあとは null） */
export function useCodeMirror({ initialValue, extensions, dynamic = [], dynamicDeps = [], onChange, onCreate }: Options): {
  host: RefObject<HTMLDivElement | null>;
  view: MutableRefObject<EditorView | null>;
} {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const [compartment] = useState(() => new Compartment());
  // 渡される関数は描くたびに変わるので、いつも最新を呼ぶ
  const latest = useRef({ onChange, dynamic });
  latest.current = { onChange, dynamic };

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          extensions(),
          compartment.of(latest.current.dynamic),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    const cleanup = onCreate?.(v);
    return () => {
      cleanup?.();
      v.destroy();
      view.current = null;
    };
    // 作るのは 1 回だけ（差し替えは下の effect）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: compartment.reconfigure(latest.current.dynamic) });
    // dynamicDeps が変わったときだけ差し替える（dynamic は描くたびに作り直される値なので依存に入れない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compartment, ...dynamicDeps]);

  return { host, view };
}
