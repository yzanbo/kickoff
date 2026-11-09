// このファイルは FileView から使うときだけ読み込む（Monaco は大きいので、普段の起動に含めない）
import * as monaco from "./monacoEditor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { useEffect, useRef } from "react";
import { useAppliedTheme } from "@/hooks/useAppliedTheme";
import type { AppliedTheme } from "@/lib/appliedTheme";
import { registerCodeSelection, type CodeSelection } from "./codeSelection";
import { SPLIT_MIN_WIDTH } from "./DiffView";
import { quickDiff, type QuickDiffHunk } from "./quickDiff";

// 補完・型チェックの裏の処理（言語ごとのワーカー）は使わない。差分の計算などの基本のワーカーだけ
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

/** 打つのが止まってから、Git との違いの帯を付け直すまでの時間 */
const QUICK_DIFF_DELAY_MS = 200;

/** 違いの種類ごとの色（右端の概要の帯。行の横の帯は CSS の .quick-diff-*） */
const QUICK_DIFF_COLORS: Record<QuickDiffHunk["kind"], string> = { added: "--ok", modified: "--info", deleted: "--ng" };

/** アプリの地の色に合わせた VS Code の配色（Dark+ / Light+） */
function applyTheme(theme: AppliedTheme) {
  const style = getComputedStyle(document.documentElement);
  const background = style.getPropertyValue("--bg").trim();
  const name = theme === "dark" ? "kickoff-dark" : "kickoff-light";
  monaco.editor.defineTheme(name, { base: theme === "dark" ? "vs-dark" : "vs", inherit: true, rules: [], colors: { "editor.background": background } });
  monaco.editor.setTheme(name);
}

/** Git との違いの帯（行番号の横の色の帯と、右端の概要の帯の印） */
function quickDiffDecorations(hunks: QuickDiffHunk[]): monaco.editor.IModelDeltaDecoration[] {
  const style = getComputedStyle(document.documentElement);
  return hunks.map((h) => {
    // 消した所は、直前の行の下の端に印（先頭を消したときは 1 行目の上の端）
    const start = Math.max(h.start, 1);
    const end = Math.max(h.end, 1);
    const top = h.kind === "deleted" && h.start === 0 ? " top" : "";
    return {
      range: { startLineNumber: start, startColumn: 1, endLineNumber: end, endColumn: 1 },
      options: {
        isWholeLine: true,
        linesDecorationsClassName: `quick-diff quick-diff-${h.kind}${top}`,
        overviewRuler: { color: style.getPropertyValue(QUICK_DIFF_COLORS[h.kind]).trim(), position: monaco.editor.OverviewRulerLane.Left },
      },
    };
  });
}

/** 選んでいる所（行・文・画面の位置。選んでいなければ null） */
function readSelection(editor: monaco.editor.ICodeEditor): CodeSelection | null {
  const model = editor.getModel();
  const selection = editor.getSelection();
  const node = editor.getDomNode();
  if (!model || !selection || selection.isEmpty() || !node) return null;
  // 行の終わりから選び始めた・次の行の頭で選び終えたときは、その行を含めない（行ごと選んだときの形）
  const first = selection.startLineNumber;
  const from = selection.startColumn === model.getLineMaxColumn(first) && selection.endLineNumber > first ? first + 1 : first;
  const to = selection.endColumn === 1 && selection.endLineNumber > from ? selection.endLineNumber - 1 : selection.endLineNumber;
  const box = node.getBoundingClientRect();
  const start = editor.getScrolledVisiblePosition(selection.getStartPosition());
  const end = editor.getScrolledVisiblePosition(selection.getEndPosition());
  const left = Math.min(start?.left ?? 0, end?.left ?? 0);
  return {
    from,
    to,
    text: model.getValueInRange(selection),
    code: model.getValueInRange({ startLineNumber: from, startColumn: 1, endLineNumber: to, endColumn: model.getLineMaxColumn(to) }),
    // 選び始めが上へ隠れていれば、部品の上の端に出す
    rect: { left: box.left + left, top: box.top + Math.max(0, Math.min(start?.top ?? 0, box.height)), width: Math.abs((end?.left ?? left) - (start?.left ?? left)) },
  };
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
}

/**
 * VS Code と同じ編集の部品（Monaco Editor）。補完・型チェックは入れず、編集と色付けだけ。
 * 行番号の横に Git との違いの帯（足した行 = 緑・変えた行 = 青・消した所 = 赤の三角。打つたびに付け直す）。
 * original があれば差分の編集（左は元の中身で読むだけ、右を編集する。変えるたびに差分を計算し直す）。
 * 入れ物の `data-quote-path` に選んでいる所の読み方を置く（右の欄で選んだ行をチャットに足す。codeSelection.ts）
 */
export default function CodeEditor({
  path,
  initialValue,
  onDirtyChange,
  onSave,
  valueRef,
  savedValue,
  line,
  original,
  layout = "unified",
  goToDiffRef,
  quickDiffBase = null,
  nativeContextMenu = true,
  autoFocus = false,
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
  const theme = useAppliedTheme();

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
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => latest.current.onSave(editor.getValue()));
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
    const unregister = registerCodeSelection(host, () => readSelection(editor));
    if (autoFocus) editor.focus();
    return () => {
      clearTimeout(timer);
      sub.dispose();
      unregister();
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
  }, [savedValue]);

  useEffect(() => {
    if (!line) return;
    editorRef.current?.revealLineInCenter(line);
    editorRef.current?.setPosition({ lineNumber: line, column: 1 });
  }, [line]);

  // data-quote-path: 右の欄・別ウィンドウで選んだ行をチャットに足すとき（useCodeQuoteMenu・SideSelectionAttach）に読む
  return <div ref={hostRef} className="code-editor" data-quote-path={path} />;
}
