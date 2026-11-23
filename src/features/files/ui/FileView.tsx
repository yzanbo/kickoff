import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { DocumentConflictBar } from "@/foundation/ui/document/DocumentConflictBar";
import { cx } from "@/foundation/ui/lib/cx";
import { registerEditorCursor, type EditorCursor } from "@/foundation/ui/lib/viewDetails";
import { useQuery } from "@/foundation/ui/query";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "./storage";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { useMainChat } from "@/features/chat/ui/screen/mainChat";
import { useWorkplace } from "@/foundation/ui/workplace/workplaceContext";
import { useDiffLayout } from "@/foundation/ui/diff/DiffLayoutToggle";
import { ImagePreview } from "./ImagePreview";
import { PagePreview } from "./PagePreview";
import { ReadOnlyCode } from "./ReadOnlyCode";
import { FileHeader } from "./FileHeader";
import { usePreviewMode } from "./usePreviewMode";
import { useFileDocument } from "./useFileDocument";
import { filesGitImpl, useBlame, useQuickDiffBase, type FileChange, type FilesGitStatus } from "./filesGit";

// 編集の部品（Monaco）は大きいので、ファイルの中身を初めて開いたときに読み込む
const CodeEditor = lazy(() => import("./CodeEditor"));

interface Props {
  projectId: number;
  /** プロジェクトのフォルダ（VS Code で開くときの場所に使う） */
  repoPath: string;
  path: string;
  /** 開く行（検索の結果から開いたとき。その行へ移る） */
  line?: number;
  /** 作業場所の Git の状態（見出しの「変更あり」・行の横の Git との違いの帯・取り直した回 version） */
  git: FilesGitStatus;
  /** 差分の「編集」から来たときの差分。編集しながら、その元の中身（ステージ済みなら HEAD、未ステージならステージした中身）を左に並べる */
  diffBase?: FileChange;
  /** 保存したとき（変更の一覧を取り直す） */
  onSaved?: () => void;
  /** 置いたタブ（未保存の登録簿の tab。タブの「●」・閉じる前の確かめが引く） */
  tab?: string;
  /** 開いたら編集の部品にピントを置く（差分の「編集」から来たとき。チャット欄・一覧のピントを奪わないよう、ふだんは置かない） */
  autoFocus?: boolean;
}

const message = (text: string) => <p className="muted small diff-message">{text}</p>;

/**
 * ファイルの中身。開く・保存・ほかで変わったときの読み直し・未保存の登録は文書の土台（useFileDocument → useDocument）で、ここはどれを描くかだけ。
 * 開いたらすぐ書ける編集の部品（CodeEditor。⌘S・保存ボタン）、行番号の横に Git との違いの帯。ほかで変わったのに書きかけがあれば conflict の帯で選ばせる。
 * 途中までのファイルは読むだけの表、画像はプレビュー、SVG・Markdown・HTML はプレビューとコードを切り替える（usePreviewMode）。
 * 差分から編集するとき（diffBase）は、VS Code と同じく差分を見ながら編集する（左に元の中身、右に編集する中身）
 */
export function FileView({ projectId, repoPath, path, line, git, diffBase, onSaved, tab, autoFocus = false }: Props) {
  const target = useWorkplace(projectId); // 作業場所（ワークツリー）を見ていれば、そのフォルダのファイル
  const { key, doc, file, base, readOnly, loadError, state, revision, change, reload } = useFileDocument({ target, path, line, git, onSaved, tab });
  // カーソルと選んでいる範囲（利用者が見ているものの知らせが読む。AI の get_user_view）
  const cursor = useRef<(() => EditorCursor | null) | null>(null);
  useEffect(() => registerEditorCursor(projectId, path, () => cursor.current?.() ?? null), [projectId, path]);
  const goToDiff = useRef<((target: "next" | "previous") => void) | null>(null);
  const getValue = useRef<(() => string) | null>(null);
  const layout = useDiffLayout();
  // 右の欄・別ウィンドウでは、右クリックをチャットに足すメニューに任せる
  const inSide = useMainChat() !== null;
  // 差分の元の中身は開いたときに一度だけ読む（保存して差分がなくなっても、比べる相手はそのまま）。
  // undefined = 読み込み中、null = 差分なしで編集する（差分から来ていない・元がバイナリ・大きすぎる・読めない）
  const [diffOf] = useState(diffBase);
  const originalQuery = useQuery(diffOf ? ["fileOriginal", key, diffOf.staged] : null, () => (diffOf ? filesGitImpl().readOriginal(target, diffOf) : Promise.resolve(null)));
  const original = !diffOf ? null : originalQuery.loaded ? (originalQuery.data ?? null) : undefined;
  const diffing = typeof original === "string";
  const preview = usePreviewMode(path, line !== undefined || Boolean(diffBase) || autoFocus);
  const { previewing, kind } = preview;
  const [wrap, setWrap] = useSetting(storage.settings.wordWrap);
  const quickDiffBase = useQuickDiffBase(target, path, git, base ? (file?.content ?? null) : null);
  const blame = useBlame(target, path, git, base?.hash ?? null);
  const diffTitle = `左は${diffOf?.staged ? "コミット（HEAD）の中身" : "ステージした中身（なければコミットの中身）"}。右を編集すると、差分がその場で変わります`;
  // プレビューに出す中身（書きかけがあればそれ。読むだけの表なら読み込んだ途中までの中身。まだ読んでいなければ null）
  const previewSource = base ? (doc.dirty && preview.draft !== null ? preview.draft : base.content) : readOnly ? (file?.content ?? null) : null;

  return (
    <div className="diff-view">
      <FileHeader
        path={path}
        absolutePath={`${target.worktree ?? repoPath}/${path}`}
        line={line}
        state={{ ...state, title: base && diffing ? diffTitle : undefined }}
        wrap={{ shown: kind !== "raster" && !previewing && Boolean(base || readOnly), on: wrap, set: setWrap }}
        preview={preview}
        onTogglePreview={() => preview.toggle(getValue.current?.() ?? null)}
        goToDiff={base && diffing ? goToDiff : null}
        save={base && { dirty: doc.dirty, busy: doc.status === "saving", run: () => void doc.save() }}
      />
      {base && doc.status === "conflict" && (
        <DocumentConflictBar onReload={reload} onOverwrite={() => void doc.save({ force: true })}>
          開いたあとで、ほかでこのファイルが変わりました。
        </DocumentConflictBar>
      )}
      <div className={cx("diff-body", (base || kind === "raster" || previewing) && "editing")}>
        {kind === "raster" && <ImagePreview projectId={projectId} path={path} version={git.version} />}
        {previewing && kind === "svg" && <ImagePreview projectId={projectId} path={path} version={git.version} source={base ? (previewSource ?? undefined) : undefined} />}
        {previewing &&
          (kind === "markdown" || kind === "html") &&
          (previewSource !== null ? (
            <PagePreview projectId={projectId} worktree={target.worktree} path={path} kind={kind} content={previewSource} />
          ) : loadError ? (
            <ErrorText message={loadError} className="diff-message" />
          ) : (
            message(file?.binary ? "バイナリのファイルなので、プレビューできません。" : "読み込み中…")
          ))}
        {/* コード（プレビューしている間は、書きかけの編集の部品を残したまま隠す） */}
        {kind !== "raster" && (!previewing || preview.codeMounted) && (
          <div className="file-code" hidden={previewing}>
            {base && original !== undefined ? (
              <Suspense fallback={message("編集の準備中…")}>
                <CodeEditor
                  key={`${key}:${revision}`}
                  path={path}
                  initialValue={doc.initial ?? base.content}
                  savedValue={base.content}
                  line={line}
                  valueRef={getValue}
                  cursorRef={cursor}
                  onChange={change}
                  onSave={() => void doc.save()}
                  original={original ?? undefined}
                  layout={layout}
                  goToDiffRef={goToDiff}
                  quickDiffBase={quickDiffBase}
                  blame={blame}
                  nativeContextMenu={!inSide}
                  autoFocus={autoFocus}
                />
              </Suspense>
            ) : base ? (
              message("編集の準備中…")
            ) : loadError ? (
              <ErrorText message={loadError} className="diff-message" />
            ) : file?.binary ? (
              message("バイナリのファイルなので、中身は表示できません。")
            ) : readOnly && file ? (
              <ReadOnlyCode path={path} content={file.content} line={line} wrap={wrap} />
            ) : (
              message("読み込み中…")
            )}
            {readOnly && message("大きいため、途中までを表示しています（編集はできません）。")}
          </div>
        )}
      </div>
    </div>
  );
}
