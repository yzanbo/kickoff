// このファイルは FileView から使うときだけ読み込む（Monaco は大きいので、普段の起動に含めない）
import * as monaco from "./monacoEditor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { useEffect, useRef } from "react";
import { useAppliedTheme } from "@/hooks/useAppliedTheme";
import type { AppliedTheme } from "@/lib/appliedTheme";
import { SPLIT_MIN_WIDTH } from "./DiffView";

// 補完・型チェックの裏の処理（言語ごとのワーカー）は使わない。差分の計算などの基本のワーカーだけ
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

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
  /** 保存した中身（ここから変えたら未保存） */
  savedValue: string;
  /** 開く行 */
  line?: number;
  /** 差分の元の中身（差分から編集するとき。あれば左に元の中身・右に編集する中身を並べる VS Code の差分の編集にする） */
  original?: string;
  /** 差分の表示のしかた（並べて表示 / まとめて表示。original があるときだけ） */
  layout?: "split" | "unified";
  /** 外から前・次の変更へ移るための入れ物（original があるときだけ入る） */
  goToDiffRef?: React.RefObject<((target: "next" | "previous") => void) | null>;
}

/**
 * VS Code と同じ編集の部品（Monaco Editor）。補完・型チェックは入れず、編集と色付けだけ。
 * original があれば差分の編集（左は元の中身で読むだけ、右を編集する。変えるたびに差分を計算し直す）
 */
export default function CodeEditor({ path, initialValue, onDirtyChange, onSave, valueRef, savedValue, line, original, layout = "unified", goToDiffRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const diffRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const saved = useRef(savedValue);
  saved.current = savedValue;
  const latest = useRef({ onDirtyChange, onSave });
  latest.current = { onDirtyChange, onSave };
  const theme = useAppliedTheme();

  useEffect(() => {
    applyTheme(theme);
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
    const sub = model.onDidChangeContent(() => {
      latest.current.onDirtyChange(model.getValue() !== saved.current);
    });
    editor.focus();
    return () => {
      sub.dispose();
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

  // 保存したら、未保存の印を付け直す
  useEffect(() => {
    const editor = editorRef.current;
    if (editor) latest.current.onDirtyChange(editor.getValue() !== savedValue);
  }, [savedValue]);

  useEffect(() => {
    if (!line) return;
    editorRef.current?.revealLineInCenter(line);
    editorRef.current?.setPosition({ lineNumber: line, column: 1 });
  }, [line]);

  return <div ref={hostRef} className="code-editor" />;
}
