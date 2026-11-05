// このファイルは FileView から使うときだけ読み込む（Monaco は大きいので、普段の起動に含めない）
import * as monaco from "./monacoEditor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { useEffect, useRef } from "react";
import { useAppliedTheme } from "@/hooks/useAppliedTheme";
import type { AppliedTheme } from "@/lib/appliedTheme";

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
  /** 文章を書く見た目（メモ。行を折り返し、行番号・全体の縮図を出さない） */
  prose?: boolean;
  /** 書き換えるたび（メモの自動の保存） */
  onChange?: (value: string) => void;
}

/** VS Code と同じ編集の部品（Monaco Editor）。補完・型チェックは入れず、編集と色付けだけ */
export default function CodeEditor({ path, initialValue, onDirtyChange, onSave, valueRef, savedValue, line, prose = false, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const saved = useRef(savedValue);
  saved.current = savedValue;
  const latest = useRef({ onDirtyChange, onSave, onChange });
  latest.current = { onDirtyChange, onSave, onChange };
  const theme = useAppliedTheme();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // ファイル名から言語を決める（拡張子ごとの色付けの定義は、使うときに読み込まれる）
    const model = monaco.editor.createModel(initialValue, undefined, monaco.Uri.file(path));
    const editor = monaco.editor.create(host, {
      model,
      automaticLayout: true,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--mono").trim(),
      fontSize: 12,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      ...(prose
        ? {
            wordWrap: "on" as const,
            lineNumbers: "off" as const,
            minimap: { enabled: false },
            folding: false,
            glyphMargin: false,
            lineDecorationsWidth: 16,
            renderLineHighlight: "none" as const,
            fontSize: 13,
            lineHeight: 22,
            padding: { top: 12, bottom: 12 },
          }
        : {}),
    });
    editorRef.current = editor;
    valueRef.current = () => editor.getValue();
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => latest.current.onSave(editor.getValue()));
    const sub = model.onDidChangeContent(() => {
      const value = model.getValue();
      latest.current.onDirtyChange(value !== saved.current);
      latest.current.onChange?.(value);
    });
    editor.focus();
    return () => {
      sub.dispose();
      editor.dispose();
      model.dispose();
      valueRef.current = null;
      editorRef.current = null;
    };
    // 同じファイルを開いている間は作り直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

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
