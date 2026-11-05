import { FileCode2, FolderSearch, Save, Type } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { cx } from "@/lib/cx";
import { MEMO_VIEW } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton } from "@/ui/IconButton";
import { InlineName } from "@/ui/InlineName";
import { reportFailure } from "@/ui/dialogs";
import { Segmented } from "@/ui/Segmented";
import { memoTitle, parentOf } from "./memoPaths";
import { useMemoDocument, type MemoSaveState } from "./useMemoDocument";

// 編集の部品（CodeMirror）は大きいので、メモを開いたときに初めて読み込む
const MarkdownEditor = lazy(() => import("./MarkdownEditor"));

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
 * 題名を押すとその場で名前を変えられ、Enter・ピントを外すとファイルの名前を変える（onRenamed に変えたあとのパス。開いている側がパスを付け替える）
 */
export function MemoView({ projectId, path, dir, onRenamed }: { projectId: number; path: string; dir: string; onRenamed: (path: string) => void }) {
  const doc = useMemoDocument(projectId, path);
  const [renaming, setRenaming] = useState(false);
  const rename = (name: string) => {
    setRenaming(false);
    void doc.rename(name).then((to) => to && onRenamed(to), reportFailure("名前を変えられませんでした"));
  };
  const [view, setView] = useSetting(MEMO_VIEW);
  const folder = parentOf(path);
  const unreadable = doc.file && (doc.file.binary || doc.file.truncated);
  const unsaved = doc.state === "dirty" || doc.state === "conflict" || doc.state === "error";

  return (
    <div className="memo-view">
      <header className="memo-head">
        <div className="memo-head-title">
          {renaming ? (
            <InlineName initial={memoTitle(path)} maxLength={120} className="memo-title-input" onSubmit={rename} onCancel={() => setRenaming(false)} />
          ) : (
            <h2>
              <button type="button" className="memo-title" title={`${path}（押すと名前を変える）`} onClick={() => setRenaming(true)}>
                {memoTitle(path)}
              </button>
            </h2>
          )}
          {folder && <span className="memo-head-folder">{folder}</span>}
        </div>
        <span className={cx("memo-save-state", unsaved && "warn")} role="status">
          {doc.initial !== null && SAVE_LABELS[doc.state]}
        </span>
        {doc.initial !== null && !unreadable && (
          <IconButton icon={Save} label="保存" keys="⌘S" disabled={doc.state === "saved" || doc.state === "saving"} onClick={doc.saveNow} />
        )}
        <Segmented
          className="segmented"
          label="メモの表示"
          value={view}
          onChange={setView}
          options={[
            { value: "preview", label: "Markdown", icon: Type, tip: "見出し・太字・リストなどを整えて見せる（カーソルのある行だけ記号を見せる）" },
            { value: "edit", label: "そのまま", icon: FileCode2, tip: "記号もそのまま見せる" },
          ]}
        />
        {window.kickoff && <IconButton icon={FolderSearch} label="Finder で表示" onClick={() => void window.kickoff?.externalApps.revealPath(`${dir}/${path}`)} />}
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
            <MarkdownEditor key={`${path}:${doc.revision}`} initialValue={doc.initial} live={view === "preview"} onChange={doc.change} onSave={doc.saveNow} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
