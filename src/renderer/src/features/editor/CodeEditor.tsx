// このファイルは FileView から使うときだけ読み込む（Monaco は大きいので、普段の起動に含めない）
import * as monaco from "./monacoEditor";
import type { EditorCursor } from "@/lib/viewDetails";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { useEffect, useRef, useState } from "react";
import type { GitBlame } from "@shared/types";
import { useAppliedTheme } from "@/hooks/useAppliedTheme";
import { useSetting } from "@/hooks/useSetting";
import { EDITOR_WORD_WRAP } from "@/lib/storageKeys";
import type { AppliedTheme } from "@/lib/appliedTheme";
import { registerCodeSelection } from "./codeSelection";
import { quickDiffDecorations, readSelection } from "./codeEditorParts";
import { MonacoFindBar } from "./MonacoFindBar";
import { syncMonacoFindOptions } from "./monacoFindOptions";
import { SPLIT_MIN_WIDTH } from "./DiffView";
import { blameAt, blameHover, blameLabel } from "./blameText";
import { quickDiff } from "./quickDiff";

// 補完・型チェックの裏の処理（言語ごとのワーカー）は使わない。差分の計算などの基本のワーカーだけ
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

/** 打つのが止まってから、Git との違いの帯を付け直すまでの時間 */
const QUICK_DIFF_DELAY_MS = 200;

/** アプリの地の色に合わせた VS Code の配色（Dark+ / Light+） */
function applyTheme(theme: AppliedTheme) {
  const style = getComputedStyle(document.documentElement);
  const background = style.getPropertyValue("--bg").trim();
  const name = theme === "dark" ? "kickoff-dark" : "kickoff-light";
  monaco.editor.defineTheme(name, { base: theme === "dark" ? "vs-dark" : "vs", inherit: true, rules: [], colors: { "editor.background": background } });
  monaco.editor.setTheme(name);
}

interface Props {
  path: string;
  /** 開いたときの中身 */
  initialValue: string;
  /** 保存した中身と違うか（未保存の印に使う） */
  onDirtyChange: (dirty: boolean) => void;
  /** ⌘S（保存ボタンと同じ） */
  onSave: (content: string) => void;
  /** 外から中身を読むための入れ物（保存ボタンで使う） */
  valueRef: React.RefObject<(() => string) | null>;
  /** カーソルの行と選んでいる範囲を読む口を入れる（利用者が見ているものの知らせ。AI の get_user_view） */
  cursorRef?: React.RefObject<(() => EditorCursor | null) | null>;
  /**
   * 保存した中身（ここから変えたら未保存）。ほかで変わって読み直したとき（書いている中身が前の値のまま = 未保存の変更がない）は、
   * 書いている中身もこれに差し替える（元に戻すで戻せる編集として入れ、見ている位置は保つ）
   */
  savedValue: string;
  /** 開く行 */
  line?: number;
  /** 差分の元の中身（差分から編集するとき。あれば左に元の中身・右に編集する中身を並べる VS Code の差分の編集にする） */
  original?: string;
  /** 差分の表示のしかた（並べて表示 / まとめて表示。original があるときだけ） */
  layout?: "split" | "unified";
  /** 外から前・次の変更へ移るための入れ物（original があるときだけ入る） */
  goToDiffRef?: React.RefObject<((target: "next" | "previous") => void) | null>;
  /** Git との違いの帯の元の中身（ステージした中身。なければコミットの中身）。null なら帯を出さない（未追跡・Git の外・読めない。original があるときも出さない） */
  quickDiffBase?: string | null;
  /** Monaco の右クリックのメニューを出すか（右の欄・別ウィンドウでは、チャットに足すメニュー useCodeQuoteMenu に任せる） */
  nativeContextMenu?: boolean;
  /** 開いたらピントを置く（差分の「編集」から来たとき。ふだんはチャット欄などのピントを奪わない） */
  autoFocus?: boolean;
  /** 行ごとの変更の記録（いまの行の右に、いつ誰が変えたかを出す。null なら出さない） */
  blame?: GitBlame | null;
}

/**
 * VS Code と同じ編集の部品（Monaco Editor）。補完・型チェックは入れず、編集と色付けだけ。
 * 行番号の横に Git との違いの帯（足した行 = 緑・変えた行 = 青・消した所 = 赤の三角。打つたびに付け直す）。
 * original があれば差分の編集（左は元の中身で読むだけ、右を編集する。変えるたびに差分を計算し直す）。
 * カーソルのある行の右に、その行をいつ誰が変えたか（VS Code の GitLens と同じ「誰, いつ • メッセージ」。乗せると詳しく）を薄く出す
 * （保存した中身で取った記録なので、未保存の変更がある間は出さない）。
 * 入れ物の `data-quote-path` に選んでいる所の読み方を置く（右の欄で選んだ行をチャットに足す。codeSelection.ts）
 */
export default function CodeEditor({
  path,
  initialValue,
  onDirtyChange,
  onSave,
  valueRef,
  cursorRef,
  savedValue,
  line,
  original,
  layout = "unified",
  goToDiffRef,
  quickDiffBase = null,
  nativeContextMenu = true,
  autoFocus = false,
  blame = null,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const diffRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const saved = useRef(savedValue);
  saved.current = savedValue;
  const latest = useRef({ onDirtyChange, onSave });
  latest.current = { onDirtyChange, onSave };
  // Git との違いの帯: 元の中身と、付け直す関数（部品を作ったときに入る）
  const quickBase = useRef(quickDiffBase);
  quickBase.current = quickDiffBase;
  const refreshQuickDiff = useRef<(() => void) | null>(null);
  // 行の変更の記録: 記録と、いまの行に付け直す関数（部品を作ったときに入る）
  const blameRef = useRef(blame);
  blameRef.current = blame;
  const refreshBlame = useRef<(() => void) | null>(null);
  const theme = useAppliedTheme();
  // 横幅に入らない行を折り返すか（ファイルの見出しのボタンと、エディタの中の ⌥Z で切り替える。どのファイルでも共通）
  const [wrap, setWrap] = useSetting(EDITOR_WORD_WRAP);
  const wrapRef = useRef({ wrap, setWrap });
  wrapRef.current = { wrap, setWrap };
  // ⌘F の検索の欄に渡すエディタ（作ったら入れる。差分の編集では右の編集する側）
  const [findEditor, setFindEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    applyTheme(theme);
    // 概要の帯の色はテーマの色から読むので、付け直す
    refreshQuickDiff.current?.();
  }, [theme]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // ファイル名から言語を決める（拡張子ごとの色付けの定義は、使うときに読み込まれる）
    const model = monaco.editor.createModel(initialValue, undefined, monaco.Uri.file(path));
    const options = {
      automaticLayout: true,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--mono").trim(),
      fontSize: 12,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      contextmenu: nativeContextMenu,
      wordWrap: wrap ? ("on" as const) : ("off" as const),
    };
    // 差分の編集: 元の中身は同じ言語で色付けし、読むだけにする（URI は編集する中身と被らないよう別の形）
    const originalModel = original === undefined ? null : monaco.editor.createModel(original, model.getLanguageId(), monaco.Uri.from({ scheme: "kickoff-original", path: `/${path}` }));
    let editor: monaco.editor.IStandaloneCodeEditor;
    if (originalModel) {
      const diff = monaco.editor.createDiffEditor(host, {
        ...options,
        renderSideBySide: layout === "split",
        useInlineViewWhenSpaceIsLimited: true,
        // 並べて表示でも、狭ければまとめて表示にする（差分の表示 DiffView と同じ幅）
        renderSideBySideInlineBreakpoint: SPLIT_MIN_WIDTH,
        originalEditable: false,
        readOnly: false,
        // 空白だけの違いも差分に出す（保存したら差分の表示と同じになるように）
        ignoreTrimWhitespace: false,
      });
      diff.setModel({ original: originalModel, modified: model });
      diffRef.current = diff;
      if (goToDiffRef) goToDiffRef.current = (target) => diff.goToDiff(target);
      editor = diff.getModifiedEditor();
    } else {
      editor = monaco.editor.create(host, { ...options, model });
    }
    editorRef.current = editor;
    valueRef.current = () => editor.getValue();
    if (cursorRef)
      cursorRef.current = () => {
        const position = editor.getPosition();
        const s = editor.getSelection();
        if (!position) return null;
        const selection = s && !s.isEmpty() ? { from_line: s.startLineNumber, from_column: s.startColumn, to_line: s.endLineNumber, to_column: s.endColumn } : null;
        return { line: position.lineNumber, selection };
      };
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => latest.current.onSave(editor.getValue()));
    // ⌥Z で折り返しを切り替える（VS Code と同じキー）
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => wrapRef.current.setWrap(!wrapRef.current.wrap));
    // Git との違いの帯（差分の編集では、差分そのものが出ているので付けない）
    const decorations = editor.createDecorationsCollection();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const paintQuickDiff = () => {
      const base = quickBase.current;
      decorations.set(base === null || originalModel ? [] : quickDiffDecorations(quickDiff(base, model.getValue())));
    };
    refreshQuickDiff.current = paintQuickDiff;
    paintQuickDiff();
    const sub = model.onDidChangeContent(() => {
      latest.current.onDirtyChange(model.getValue() !== saved.current);
      clearTimeout(timer);
      timer = setTimeout(paintQuickDiff, QUICK_DIFF_DELAY_MS);
    });
    // いまの行の変更の記録（行の終わりのあとに薄い字で足す。カーソルはそこに止まらない）
    const blameDecorations = editor.createDecorationsCollection();
    const paintBlame = () => {
      const position = editor.getPosition();
      const commit = position && model.getValue() === saved.current ? blameAt(blameRef.current, position.lineNumber, model.getLineCount()) : null;
      if (!position || !commit) return blameDecorations.clear();
      const column = model.getLineMaxColumn(position.lineNumber);
      blameDecorations.set([
        {
          range: { startLineNumber: position.lineNumber, startColumn: column, endLineNumber: position.lineNumber, endColumn: column },
          options: {
            // 幅のない範囲の差し込みの文字は、showIfCollapsed がないと描かれない
            showIfCollapsed: true,
            after: { content: `\u2003${blameLabel(commit)}`, inlineClassName: "blame-inline", cursorStops: monaco.editor.InjectedTextCursorStops.None },
            hoverMessage: { value: blameHover(commit) },
          },
        },
      ]);
    };
    refreshBlame.current = paintBlame;
    paintBlame();
    const cursorSub = editor.onDidChangeCursorPosition(paintBlame);
    const blameContentSub = model.onDidChangeContent(paintBlame);
    const unregister = registerCodeSelection(host, () => readSelection(editor));
    // ⌘F の検索の欄（ほかの検索の欄と同じ部品。エディタの中の ⌘F・ページの ⌘F は MonacoFindBar が受け取る）
    setFindEditor(editor);
    // 検索の欄の「Aa」「ab」「.*」は、ほかの検索の欄と同じ値にそろえる
    const unsyncFind = syncMonacoFindOptions(editor);
    if (autoFocus) editor.focus();
    return () => {
      clearTimeout(timer);
      sub.dispose();
      cursorSub.dispose();
      blameContentSub.dispose();
      refreshBlame.current = null;
      unregister();
      setFindEditor(null);
      unsyncFind();
      refreshQuickDiff.current = null;
      // 差分の編集では、左右の部品は差分の部品が一緒に片付ける
      (diffRef.current ?? editor).dispose();
      model.dispose();
      originalModel?.dispose();
      valueRef.current = null;
      if (goToDiffRef) goToDiffRef.current = null;
      editorRef.current = null;
      diffRef.current = null;
    };
    // 同じファイルを開いている間は作り直さない（元の中身は開いたときのまま）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // 差分の表示のしかたを変えたら、作り直さずに切り替える
  useEffect(() => {
    diffRef.current?.updateOptions({ renderSideBySide: layout === "split" });
  }, [layout]);

  useEffect(() => {
    editorRef.current?.updateOptions({ contextmenu: nativeContextMenu });
  }, [nativeContextMenu]);

  // 折り返しを切り替えたら、作り直さずに変える（差分の編集では左右とも）
  useEffect(() => {
    const wordWrap = wrap ? "on" : "off";
    if (diffRef.current) diffRef.current.updateOptions({ wordWrap });
    else editorRef.current?.updateOptions({ wordWrap });
  }, [wrap]);

  // 行の変更の記録を読み直したら、いまの行に付け直す
  useEffect(() => {
    refreshBlame.current?.();
  }, [blame]);

  // Git との違いの元の中身が変わったら（ステージした・取り直した）、帯を付け直す
  useEffect(() => {
    refreshQuickDiff.current?.();
  }, [quickDiffBase]);

  // 保存した・ほかで変わって読み直したら、未保存の印を付け直す。
  // 読み直したときに書いている中身が前の保存した中身のまま（自分では変えていない）なら、新しい中身に差し替える
  const previousSaved = useRef(savedValue);
  useEffect(() => {
    const editor = editorRef.current;
    const before = previousSaved.current;
    previousSaved.current = savedValue;
    const model = editor?.getModel();
    if (!editor || !model) return;
    if (before !== savedValue && model.getValue() === before) {
      const view = editor.saveViewState();
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text: savedValue }], () => null);
      if (view) editor.restoreViewState(view);
    }
    latest.current.onDirtyChange(editor.getValue() !== savedValue);
    refreshBlame.current?.();
  }, [savedValue]);

  useEffect(() => {
    if (!line) return;
    editorRef.current?.revealLineInCenter(line);
    editorRef.current?.setPosition({ lineNumber: line, column: 1 });
  }, [line]);

  // data-quote-path: 右の欄・別ウィンドウで選んだ行をチャットに足すとき（useCodeQuoteMenu・SideSelectionAttach）に読む
  return (
    <>
      <div ref={hostRef} className="code-editor" data-quote-path={path} />
      {findEditor && hostRef.current && <MonacoFindBar editor={findEditor} host={hostRef.current} />}
    </>
  );
}
