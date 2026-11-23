// CodeMirror 6 の編集の部品を 1 つ作る hook。
// 作るのは描いたときの 1 回だけ（中身を入れ直すときは key を変えて作り直す）。書き換わったら onChange にいまの文を渡し、
// 途中で変える拡張（言語の補完・表示の切り替え）は dynamic に渡せば、dynamicDeps が変わったときに差し替える。共通の見た目（appEditorTheme）はいつも足す。
// 履歴・キー・⌘F の欄・検索の文言は、使う側が extensions に kit/codemirror/baseExtensions を入れる
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useEffectEvent, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { appEditorTheme } from "@/foundation/ui/code/codemirrorTheme";

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
  // 渡される関数・拡張は描くたびに変わるので、effect と CodeMirror の知らせからいつも最新を読む
  const changed = useEffectEvent((text: string) => onChange(text));
  const create = useEffectEvent((parent: HTMLDivElement) => {
    const v = new EditorView({
      parent,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          appEditorTheme,
          extensions(),
          compartment.of(dynamic),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) changed(u.state.doc.toString());
          }),
        ],
      }),
    });
    // onCreate より先に置く（onCreate の中から view を読めるように）
    view.current = v;
    return { v, cleanup: onCreate?.(v) };
  });
  const reconfigure = useEffectEvent(() => view.current?.dispatch({ effects: compartment.reconfigure(dynamic) }));

  // 作るのは 1 回だけ（差し替えは下の effect）
  useEffect(() => {
    if (!host.current) return;
    const { v, cleanup } = create(host.current);
    return () => {
      cleanup?.();
      v.destroy();
      view.current = null;
    };
  }, []);

  // dynamicDeps が変わったときだけ差し替える（dynamic は描くたびに作り直される値なので依存に入れない）
  useEffect(() => {
    reconfigure();
  }, [compartment, ...dynamicDeps]);

  return { host, view };
}
