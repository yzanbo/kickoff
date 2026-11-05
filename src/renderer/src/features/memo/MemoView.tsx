import { CodeXml, Eye, FolderSearch, Save } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { isCancelKey, isComposing, isKey } from "@/lib/keys";
import { MEMO_VIEW } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton } from "@/ui/IconButton";
import { reportFailure } from "@/ui/dialogs";
import { Segmented } from "@/ui/Segmented";
import { PopOutTabButton } from "@/features/panel/tabs/PopOutTabButton";
import type { MemoEditorHandle } from "./MarkdownEditor";
import { MemoAiButton, type MemoAiOpenRequest } from "./MemoAiButton";
import { MemoAiProposal } from "./MemoAiProposal";
import { memoTitle, parentOf } from "./memoPaths";
import { useMemoAi } from "./useMemoAi";
import { useMemoDocument, type MemoSaveState } from "./useMemoDocument";

// 編集の部品（CodeMirror）は大きいので、メモを開いたときに初めて読み込む
const MarkdownEditor = lazy(() => import("./MarkdownEditor"));

/** 「AI で直す」の頼みの欄のおよその高さ（選んだ文の上に入るかの見積もり） */
const AI_POPOVER_HEIGHT = 300;

/** 保存の様子の文（見出しの右） */
const SAVE_LABELS: Record<MemoSaveState, string> = {
  saved: "保存済み",
  dirty: "未保存（⌘S で保存）",
  saving: "保存中…",
  conflict: "ほかで変わりました",
  error: "保存できませんでした",
};

/**
 * 開いているメモ（見出しに題名とフォルダ・保存の様子・保存・表示の切り替え・Finder で表示）。
 * 表示は Markdown（Obsidian のライブプレビューと同じ。カーソルの行だけ記号を見せる）/ そのまま（記号もそのまま）。
 * どちらでも書けて、⌘S で保存する（書いている間は保存しない。まだ保存していない書きかけは残り、離れるときに聞く）。
 * 題名はいつでも書き換えられる欄（押せばそのままキャレットが入る。入力の画面に切り替えない）で、本文と同じく ⌘S（題名の欄では Enter も）で
 * 本文を保存してからファイルの名前を変える（onRenamed に変えたあとのパス。開いている側がパスを付け替える）。Esc で元の題名に戻す
 */
export function MemoView({ projectId, path, dir, onRenamed }: { projectId: number; path: string; dir: string; onRenamed: (path: string) => void }) {
  const doc = useMemoDocument(projectId, path);
  // 編集の部品を外から動かす口（AI の案を取り込む）と、AI の整理
  const editor = useRef<MemoEditorHandle | null>(null);
  const ai = useMemoAi(projectId, path, editor);
  // 本文の選択の上の「AI で直す」を押した（見出しの「AI で直す」の欄をその場所に開く）
  const [aiFrom, setAiFrom] = useState<MemoAiOpenRequest | null>(null);
  // 頼みの欄は選んだ文を隠さないように出す: 最初の行の上に入る（およそ欄の高さ分の空きがある）ならそこ、なければ最後の行の下
  const askAiFromSelection = (button: HTMLElement) => {
    const lines = editor.current?.selectionLines();
    const left = button.getBoundingClientRect().left;
    const top = lines?.first.getBoundingClientRect().top ?? button.getBoundingClientRect().bottom;
    const bottom = lines?.last.getBoundingClientRect().bottom ?? top;
    const roomAbove = top > AI_POPOVER_HEIGHT;
    setAiFrom({ left, y: roomAbove ? top : bottom, side: roomAbove ? "above" : "below", at: Date.now() });
  };
  const savedTitle = memoTitle(path);
  // 書いている題名（別のメモへ移った・名前を変えたら、そのメモの題名に入れ直す）
  const [title, setTitle] = useState(savedTitle);
  useEffect(() => setTitle(savedTitle), [savedTitle]);
  const titleChanged = title.trim() !== "" && title.trim() !== savedTitle;
  // ⌘S・保存のボタン: 本文を保存してから、題名が変わっていればファイルの名前を変える
  const saveNow = () => {
    void doc.save().then(async (saved) => {
      if (!saved || !titleChanged) return;
      const to = await doc.rename(title.trim()).catch((e: unknown) => {
        reportFailure("名前を変えられませんでした")(e);
        return null;
      });
      if (to) onRenamed(to);
    });
  };
  const [view, setView] = useSetting(MEMO_VIEW);
  const folder = parentOf(path);
  const unreadable = doc.file && (doc.file.binary || doc.file.truncated);
  const unsaved = doc.state === "dirty" || doc.state === "conflict" || doc.state === "error" || titleChanged;

  return (
    <div className="memo-view">
      <header className="memo-head">
        <div className="memo-head-title">
          <input
            className="memo-title"
            value={title}
            maxLength={120}
            spellCheck={false}
            aria-label="メモの名前（⌘S で保存）"
            title={`${path}（書き換えて ⌘S で名前を変える）`}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (isComposing(e)) return;
              if (isKey(e, "s", { meta: true }) || isKey(e, "s", { ctrl: true }) || isKey(e, "Enter")) {
                e.preventDefault();
                saveNow();
              } else if (isCancelKey(e) && title !== savedTitle) {
                // 元の題名に戻す（右の欄を閉じる Esc には渡さない）
                e.preventDefault();
                e.stopPropagation();
                setTitle(savedTitle);
              }
            }}
          />
          {folder && <span className="memo-head-folder">{folder}</span>}
        </div>
        <span className={cx("memo-save-state", unsaved && "warn")} role="status">
          {doc.initial !== null && SAVE_LABELS[titleChanged && doc.state === "saved" ? "dirty" : doc.state]}
        </span>
        {doc.initial !== null && !unreadable && (
          <IconButton icon={Save} label="保存" keys="⌘S" disabled={(doc.state === "saved" && !titleChanged) || doc.state === "saving"} onClick={saveNow} />
        )}
        <Segmented
          className="view-toggle"
          label="メモの表示"
          value={view}
          onChange={setView}
          options={[
            // アイコンだけ（名前と説明は乗せたときに出す）。整えて見せる = 目、記号のまま = ソースの </>
            { value: "preview", label: "Markdown で表示（見出し・太字・リストなどを整えて見せる。カーソルのある行だけ記号を見せる）", icon: Eye, iconOnly: true },
            { value: "edit", label: "そのまま表示（Markdown の記号もそのまま見せる）", icon: CodeXml, iconOnly: true },
          ]}
        />
        {doc.initial !== null && !unreadable && <MemoAiButton ai={ai} openFrom={aiFrom} />}
        {window.kickoff && <IconButton icon={FolderSearch} label="Finder で表示" onClick={() => void window.kickoff?.externalApps.revealPath(`${dir}/${path}`)} />}
        {/* 右の欄のタブのときだけ、右端に「別ウィンドウで開く」 */}
        <PopOutTabButton />
      </header>
      {doc.state === "conflict" && (
        <div className="file-changed-notice" role="status">
          開いたあとで、ほかでこのメモが変わりました（チャットからの追記・ほかのアプリなど）。
          <button className="btn btn-sm" onClick={() => void doc.reload()}>
            読み直す（書いたものは捨てる）
          </button>
          <button className="btn btn-sm" onClick={doc.overwrite}>
            書いたもので上書き
          </button>
        </div>
      )}
      {doc.error && <ErrorText message={doc.error} className="memo-message" />}
      <div className="memo-body">
        {doc.loadError ? (
          <ErrorText message={doc.loadError} className="memo-message" />
        ) : doc.initial === null ? (
          <p className="muted small memo-message">読み込み中…</p>
        ) : unreadable ? (
          <p className="muted small memo-message">{doc.file?.binary ? "文字のファイルではないので、ここでは開けません。Finder から開いてください。" : "大きすぎるので、ここでは開けません。"}</p>
        ) : (
          <Suspense fallback={<p className="muted small memo-message">編集の準備中…</p>}>
            <MemoAiProposal ai={ai} />
            <MarkdownEditor key={`${path}:${doc.revision}`} initialValue={doc.initial} live={view === "preview"} onChange={doc.change} onSave={saveNow} handleRef={editor} onAskAi={askAiFromSelection} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
