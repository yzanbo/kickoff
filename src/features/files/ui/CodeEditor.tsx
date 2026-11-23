// このファイルは FileView から使うときだけ読み込む（Monaco は大きいので、普段の起動に含めない）
import * as monaco from "./monacoEditor";
import type { EditorCursor } from "@/foundation/ui/lib/viewDetails";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useAppliedTheme } from "@/foundation/ui/hooks/useAppliedTheme";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { storage } from "./storage";
import type { AppliedTheme } from "@/foundation/ui/theme/appliedTheme";
import { attachBlame, attachFind, attachQuickDiff, attachSaveKeys, attachSelection, type AttachContext, type EditorAttachment } from "./codeEditorParts";
import { MonacoFindBar } from "./MonacoFindBar";
import { SPLIT_MIN_WIDTH } from "@/foundation/ui/diff/DiffTable";
import type { BlameLines } from "./filesGit";
import { editorModelUris } from "./editorModels";

// 補完・型チェックの裏の処理（言語ごとのワーカー）は使わない。差分の計算などの基本のワーカーだけ
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };

/** 作ったエディタへの付け足し（この順に付け、逆の順に外す） */
const ATTACHMENTS: EditorAttachment[] = [attachSaveKeys, attachQuickDiff, attachBlame, attachSelection, attachFind];

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
  /** 中身が変わったとき（打った・ほかで変わって読み直した） */
  onChange: (value: string) => void;
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
  blame?: BlameLines | null;
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
  onChange,
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
  // Monaco から呼ばれる処理が読むいまの値（描く中では書かない。useLatest）
  const saved = useLatest(savedValue);
  const latest = useLatest({ onChange, onSave });
  // Git との違いの帯: 元の中身と、付け直す関数（部品を作ったときに入る）
  const quickBase = useLatest(quickDiffBase);
  const refreshQuickDiff = useRef<(() => void) | null>(null);
  // 行の変更の記録: 記録と、いまの行に付け直す関数（部品を作ったときに入る）
  const blameRef = useLatest(blame);
  const refreshBlame = useRef<(() => void) | null>(null);
  const theme = useAppliedTheme();
  // 横幅に入らない行を折り返すか（ファイルの見出しのボタンと、エディタの中の ⌥Z で切り替える。どのファイルでも共通）
  const [wrap, setWrap] = useSetting(storage.settings.wordWrap);
  const wrapRef = useLatest({ wrap, setWrap });
  // ⌘F の検索の欄に渡すエディタ（作ったら入れる。差分の編集では右の編集する側）
  // （入れ物の要素も一緒に持つ。描く中で hostRef を読まない）
  const [findEditor, setFindEditor] = useState<{ editor: monaco.editor.IStandaloneCodeEditor; host: HTMLDivElement } | null>(null);

  useEffect(() => {
    applyTheme(theme);
    // 概要の帯の色はテーマの色から読むので、付け直す
    refreshQuickDiff.current?.();
  }, [theme]);

  // エディタを作る（作るときの中身・設定は、作る時点の値を読む。同じファイルの間は作り直さないので、effect の依存にしない）
  const create = useEffectEvent((host: HTMLDivElement) => {
    // ファイル名から言語を決める（拡張子ごとの色付けの定義は、使うときに読み込まれる）。住所は部品ごと（同じファイルを 2 か所で開いても重ならない）
    const uris = editorModelUris(path);
    const model = monaco.editor.createModel(initialValue, undefined, monaco.Uri.from(uris.modified));
    const options = {
      automaticLayout: true,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--mono").trim(),
      fontSize: 12,
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      contextmenu: nativeContextMenu,
      wordWrap: wrap ? ("on" as const) : ("off" as const),
    };
    // 差分の編集: 元の中身は同じ言語で色付けし、読むだけにする
    const originalModel = original === undefined ? null : monaco.editor.createModel(original, model.getLanguageId(), monaco.Uri.from(uris.original));
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
    const changeSub = model.onDidChangeContent(() => latest.current.onChange(model.getValue()));
    const ctx: AttachContext = {
      host,
      diffing: originalModel !== null,
      saved: () => saved.current,
      quickBase: () => quickBase.current,
      blame: () => blameRef.current,
      save: (content) => latest.current.onSave(content),
      toggleWrap: () => wrapRef.current.setWrap(!wrapRef.current.wrap),
      showFind: (e) => setFindEditor(e && { editor: e, host }),
      setRefresh: (kind, refresh) => void ((kind === "quickDiff" ? refreshQuickDiff : refreshBlame).current = refresh),
    };
    const attached = ATTACHMENTS.map((attach) => attach(editor, model, ctx));
    if (autoFocus) editor.focus();
    return () => {
      // 付け足しは付けたのと逆の順に外す
      for (const a of attached.reverse()) a.dispose();
      changeSub.dispose();
      // 差分の編集では、左右の部品は差分の部品が一緒に片付ける
      (diffRef.current ?? editor).dispose();
      model.dispose();
      originalModel?.dispose();
      valueRef.current = null;
      if (goToDiffRef) goToDiffRef.current = null;
      editorRef.current = null;
      diffRef.current = null;
    };
  });
  // 同じファイルを開いている間は作り直さない（元の中身は開いたときのまま）
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    return create(host);
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

  // ほかで変わって読み直したとき、書いている中身が前の保存した中身のまま（自分では変えていない）なら、新しい中身に差し替える
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
      {findEditor && <MonacoFindBar editor={findEditor.editor} host={findEditor.host} />}
    </>
  );
}
