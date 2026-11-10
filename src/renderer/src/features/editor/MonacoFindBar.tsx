import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFindOptions } from "@/hooks/useFindOptions";
import { findPattern } from "@/lib/textFind";
import { FindField, findCountText } from "@/ui/FindField";
import { registerEditorFind } from "./editorFind";
import * as monaco from "./monacoEditor";
import { MONACO_MATCHES_LIMIT, monacoFindController } from "./monacoFindOptions";

/**
 * ファイルのエディタ（Monaco。ファイル・検索・変更のタブ・右の欄・別ウィンドウ）の ⌘F の検索の欄。ほかの検索の欄と同じ部品（ui/FindField）で、
 * エディタの右上に浮かせる（利用者の依頼。前は Monaco が描く検索の欄で、見た目がほかと違った）。
 * 探す・印・移る・置き換えは Monaco の検索の仕組み（editor.contrib.findController）をそのまま使い、Monaco の検索の欄は CSS で隠す（.code-editor .find-widget）。
 * 欄を出すかは Monaco の検索の様子（isRevealed）に合わせる（エディタの中の Esc・⌘G で Monaco が開け閉めしても、この欄がついていく）。
 * ⌘F（エディタの中・ページの ⌘F）で開き、⌥⌘F で置き換えの行も開く。選んでいる 1 行の文があれば、それを入れる
 */
export function MonacoFindBar({ editor, host }: { editor: monaco.editor.IStandaloneCodeEditor; host: HTMLElement }) {
  const controller = monacoFindController(editor);
  const state = controller?.getState();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const { options, toggle } = useFindOptions();
  const inputRef = useRef<HTMLInputElement>(null);
  // 開くたびに増やす（欄にピントを置いて文を選ぶ）
  const [focusSignal, setFocusSignal] = useState(0);

  // Monaco の検索の様子が変わったら描き直す（件数・何番目か・開け閉め・文）
  useEffect(() => {
    const sub = state?.onFindReplaceStateChange(rerender);
    return () => sub?.dispose();
  }, [state]);

  // 開く: Monaco の検索を始め（一致を探す仕組みを作り、選んでいる 1 行の文を入れる）、この欄にピントを置く
  useEffect(() => {
    if (!controller) return;
    const open = (withReplace: boolean) => {
      void controller
        .start({
          forceRevealReplace: withReplace,
          seedSearchStringFromSelection: "single",
          seedSearchStringFromNonEmptySelection: true,
          seedSearchStringFromGlobalClipboard: false,
          shouldFocus: 0,
          shouldAnimate: false,
          updateSearchScope: false,
          loop: true,
        })
        .then(() => setFocusSignal((n) => n + 1));
    };
    // エディタの中の ⌘F・⌥⌘F（Monaco の検索の欄を開く既定のキーより先に受け取る）
    const find = editor.addAction({ id: "kickoff.find", label: "検索", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF], run: () => open(false) });
    const replace = editor.addAction({
      id: "kickoff.findReplace",
      label: "置換",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: () => open(!editor.getOption(monaco.editor.EditorOption.readOnly)),
    });
    // ページの ⌘F（ピントがエディタの外にあるとき）
    const unregister = registerEditorFind(host, () => open(false));
    return () => {
      find.dispose();
      replace.dispose();
      unregister();
    };
  }, [controller, editor, host]);

  useEffect(() => {
    if (!focusSignal) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSignal]);

  if (!controller || !state?.isRevealed || !host.isConnected) return null;
  const query = state.searchString;
  const pattern = findPattern(query, options);
  const invalid = pattern !== null && "error" in pattern;
  const total = state.matchesCount;
  const close = () => {
    controller.closeFindWidget();
    editor.focus();
  };
  return createPortal(
    <FindField
      inputRef={inputRef}
      value={query}
      // 打つたびに、カーソルから近い一致へ移る（VS Code と同じ）
      onChange={(v) => state.change({ searchString: v }, true)}
      placeholder="このファイルを検索"
      invalid={invalid}
      options={options}
      onToggleOption={toggle}
      count={findCountText({ invalid, query, total, current: state.matchesPosition > 0 ? state.matchesPosition - 1 : null, capped: total >= MONACO_MATCHES_LIMIT })}
      canStep={total > 0}
      onStep={(step) => (step === 1 ? controller.moveToNextMatch() : controller.moveToPrevMatch())}
      onClose={close}
      replace={
        editor.getOption(monaco.editor.EditorOption.readOnly)
          ? undefined
          : {
              open: state.isReplaceRevealed,
              onOpenChange: (open) => state.change({ isReplaceRevealed: open }, false),
              value: state.replaceString,
              onChange: (v) => state.change({ replaceString: v }, false),
              onReplace: () => controller.replace(),
              onReplaceAll: () => controller.replaceAll(),
              canReplace: total > 0,
            }
      }
      className="monaco-find"
    />,
    host,
  );
}
