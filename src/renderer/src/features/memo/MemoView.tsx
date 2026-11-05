import { BookOpen, FolderSearch, PenLine } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { cx } from "@/lib/cx";
import { MEMO_VIEW } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton } from "@/ui/IconButton";
import { Markdown } from "@/ui/markdown/Markdown";
import { Segmented } from "@/ui/Segmented";
import { memoTitle, parentOf } from "./memoPaths";
import { useMemoDocument, type MemoSaveState } from "./useMemoDocument";

// 編集の部品（Monaco）は大きいので、メモを開いたときに初めて読み込む
const CodeEditor = lazy(() => import("@/features/editor/CodeEditor"));

/** 保存の様子の文（見出しの右） */
const SAVE_LABELS: Record<MemoSaveState, string> = {
  idle: "保存しました",
  pending: "未保存",
  saving: "保存中…",
  conflict: "ほかで変わりました",
  error: "保存できませんでした",
};

/**
 * 開いているメモ（見出しに題名とフォルダ・保存の様子・書く / 読むの切り替え・Finder で表示）。
 * 書く = Markdown をそのまま書く（行を折り返す。書くのが止まったら自動で保存）、読む = 整えて出す
 */
export function MemoView({ projectId, path, dir }: { projectId: number; path: string; dir: string }) {
  const doc = useMemoDocument(projectId, path);
  const [view, setView] = useSetting(MEMO_VIEW);
  // 読む表示に切り替えたときの中身（書いている途中のものも出す）
  const [previewText, setPreviewText] = useState<string | null>(null);
  const folder = parentOf(path);
  const changeView = (next: "edit" | "preview") => {
    if (next === "preview") {
      setPreviewText(doc.currentText());
      doc.saveNow();
    }
    setView(next);
  };
  const preview = view === "preview";
  const unreadable = doc.file && (doc.file.binary || doc.file.truncated);

  return (
    <div className="memo-view">
      <header className="memo-head">
        <div className="memo-head-title">
          <h2 title={path}>{memoTitle(path)}</h2>
          {folder && <span className="memo-head-folder">{folder}</span>}
        </div>
        <span className={cx("memo-save-state", (doc.state === "error" || doc.state === "conflict") && "warn")} role="status">
          {doc.initial !== null && SAVE_LABELS[doc.state]}
        </span>
        <Segmented
          className="segmented"
          label="メモの出し方"
          value={view}
          onChange={changeView}
          options={[
            { value: "edit", label: "書く", icon: PenLine },
            { value: "preview", label: "読む", icon: BookOpen },
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
      <div className={cx("memo-body", preview && "preview")}>
        {doc.loadError ? (
          <ErrorText message={doc.loadError} className="memo-message" />
        ) : doc.initial === null ? (
          <p className="muted small memo-message">読み込み中…</p>
        ) : unreadable ? (
          <p className="muted small memo-message">{doc.file?.binary ? "文字のファイルではないので、ここでは開けません。Finder から開いてください。" : "大きすぎるので、ここでは開けません。"}</p>
        ) : preview ? (
          <div className="memo-preview">
            {(previewText ?? doc.initial).trim() ? <Markdown>{previewText ?? doc.initial}</Markdown> : <p className="muted small">まだ何も書いていません。「書く」に切り替えて書けます。</p>}
          </div>
        ) : (
          <Suspense fallback={<p className="muted small memo-message">編集の準備中…</p>}>
            <CodeEditor
              key={`${path}:${doc.revision}`}
              // ほかのタブで同じ名前のファイルを開いていても重ならないよう、メモの印を付けた場所にする（拡張子で色付けが決まる）
              path={`/kickoff-memos/${projectId}/${path}`}
              // 読む表示から戻ったときも、書きかけの中身から（保存はまだのことがある）
              initialValue={doc.currentText()}
              savedValue={doc.initial}
              valueRef={{ current: null }}
              prose
              onDirtyChange={() => {}}
              onChange={doc.change}
              onSave={doc.saveNow}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
