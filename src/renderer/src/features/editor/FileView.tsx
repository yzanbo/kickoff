import { ExternalLink, Pencil, Save, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/api";
import { cx } from "@/lib/cx";
import { confirmDialog } from "@/ui/dialogs";
import { useAction } from "@/hooks/useAction";
import { useHighlight } from "@/hooks/useHighlight";
import { languageOf } from "@/lib/languages";
import { useKeyedAsync } from "@/hooks/useKeyedAsync";
import { CodeLine } from "@/ui/CodeLine";
import { ErrorText } from "@/ui/ErrorText";
import { useGitTarget } from "@/features/worktree/worktreeContext";

// 編集の部品（Monaco）は大きいので、「編集」を押したときに初めて読み込む
const CodeEditor = lazy(() => import("./CodeEditor"));

interface Props {
  projectId: number;
  /** プロジェクトのフォルダ（VS Code で開くときの場所に使う） */
  repoPath: string;
  path: string;
  /** 開く行（検索の結果から開いたとき。目立たせる） */
  line?: number;
  /** コミットしていない変更があるか（見出しに出す） */
  changed?: boolean;
  /** 開いたらすぐ編集する（差分の「編集」から来たとき） */
  initialEditing?: boolean;
  version: number;
  /** 保存したとき（変更の一覧を取り直す） */
  onSaved?: () => void;
  /** 保存していない変更があるか（別のファイルを開く前に確かめる） */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * ファイルの中身（行番号つき）。「編集」で VS Code と同じ編集の部品にし、⌘S・保存ボタンで保存する。
 * 保存の前に、開いたあとでほかで（エージェントなどが）変えていないか確かめ、変わっていれば上書きするか聞く
 */
export function FileView({ projectId, repoPath, path, line, changed = false, initialEditing = false, version, onSaved, onDirtyChange }: Props) {
  // 作業場所（ワークツリー）を見ていれば、そのフォルダのファイル
  const { target, key: at, worktree } = useGitTarget(projectId);
  const key = `${at}:${path}`;
  // 同じ作業場所の同じファイルなら、取り直している間も前の中身を出す。別のファイルに変わったら読み込み中に戻る
  const loaded = useKeyedAsync(key, () => api.projectFile(target, path), { deps: [version] });
  // 編集: 開いたとき（保存したとき）の中身と指紋。null なら見るだけ
  const [base, setBase] = useState<{ content: string; hash: string } | null>(null);
  const [wantEdit, setWantEdit] = useState(initialEditing);
  const [dirty, setDirty] = useState(false);
  // 保存している間と、その結果（保存しました・失敗の理由）
  const saving = useAction<"save">();
  const [editorKey, setEditorKey] = useState(0);
  const getValue = useRef<(() => string) | null>(null);

  const current = loaded.loaded ? { file: loaded.data, error: loaded.error } : undefined;
  const editable = Boolean(current?.file && !current.file.binary && !current.file.truncated);
  // 「編集」を押したら（差分から来たら）、読み込んだ中身から編集を始める
  useEffect(() => {
    if (wantEdit && editable && current?.file && !base) {
      setBase({ content: current.file.content, hash: current.file.hash });
      setWantEdit(false);
    }
  }, [wantEdit, editable, current?.file, base]);

  const changeDirty = (next: boolean) => {
    setDirty(next);
    if (next) saving.reset();
    onDirtyChange?.(next);
  };

  // 開いたときの指紋と比べて保存する。ほかで変わっていれば、上書きするか聞いてから指紋なしで保存し直す
  const save = (content: string) =>
    base &&
    saving.run(
      "save",
      async () => {
        const write = (hash: string | null) => api.saveProjectFile(target, path, content, hash);
        let saved: { hash: string };
        try {
          saved = await write(base.hash);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 409)) throw e;
          const overwrite = await confirmDialog({
            title: "ほかでファイルが変わっています",
            message: "開いたあとで、エージェントなどがこのファイルを変えました。上書きすると、その変更は消えます。",
            confirmLabel: "上書きする",
            danger: true,
          });
          if (!overwrite) throw new Error("保存していません（ほかでの変更を確かめてください）");
          saved = await write(null);
        }
        setBase({ content, hash: saved.hash });
        onSaved?.();
      },
      { done: "保存しました" },
    );

  const stopEditing = async () => {
    if (dirty && !(await confirmDialog({ title: "保存していない変更を捨てますか？", confirmLabel: "捨てる", danger: true }))) return;
    setBase(null);
    changeDirty(false);
    saving.reset();
    loaded.reload();
  };

  // ほかで変わった中身を読み直して、編集をやり直す（自分の変更は捨てる）
  const reloadFromDisk = async () => {
    if (dirty && !(await confirmDialog({ title: "保存していない変更を捨てて読み直しますか？", confirmLabel: "読み直す", danger: true }))) return;
    if (!current?.file) return;
    setBase({ content: current.file.content, hash: current.file.hash });
    setEditorKey((n) => n + 1);
    changeDirty(false);
    saving.reset();
  };

  // 編集している間に、ほかでファイルが変わった
  const changedOnDisk = Boolean(base && current?.file && current.file.hash !== base.hash);
  const lines = useMemo(() => current?.file?.content.replace(/\n$/, "").split("\n") ?? [], [current?.file]);
  const tokens = useHighlight(base ? [] : lines, languageOf(path));
  const focusRef = useRef<HTMLTableRowElement>(null);
  // 開いた行を真ん中に出す（中身を読み込んだあと・別の行を選んだとき）
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "center" });
  }, [line, lines]);

  return (
    <div className="diff-view">
      <header className="diff-head">
        <span className="diff-path" title={path}>
          {path}
        </span>
        <span className={cx("diff-state", saving.error && "error")}>
          {saving.result?.text ??
            (base ? (dirty ? "編集中・未保存" : "編集中") : `${line !== undefined ? `${line} 行目・` : ""}${changed ? "変更あり" : "変更なし"}`)}
        </span>
        <span className="spacer" />
        {window.kickoff && (
          <button className="btn btn-sm" title="VS Code でこのファイルを開く" onClick={() => void window.kickoff?.externalApps.openInVSCode(`${worktree ?? repoPath}/${path}`, line)}>
            <ExternalLink size={13} aria-hidden /> VS Code で開く
          </button>
        )}
        {base ? (
          <>
            <button className="btn btn-sm btn-primary" disabled={!dirty || saving.busy !== null} title="保存（⌘S）" onClick={() => getValue.current && void save(getValue.current())}>
              <Save size={13} aria-hidden /> {saving.busy ? "保存中…" : "保存"}
            </button>
            <button className="btn btn-sm" onClick={() => void stopEditing()}>
              <X size={13} aria-hidden /> 編集をやめる
            </button>
          </>
        ) : (
          editable && (
            <button className="btn btn-sm" onClick={() => setWantEdit(true)}>
              <Pencil size={13} aria-hidden /> 編集
            </button>
          )
        )}
      </header>
      {changedOnDisk && (
        <div className="file-changed-notice" role="status">
          開いたあとで、ほかでこのファイルが変わりました。
          <button className="btn btn-sm" onClick={() => void reloadFromDisk()}>
            読み直す
          </button>
        </div>
      )}
      <div className={cx("diff-body", base && "editing")}>
        {base ? (
          <Suspense fallback={<p className="muted small diff-message">編集の準備中…</p>}>
            <CodeEditor
              key={editorKey}
              path={path}
              initialValue={base.content}
              savedValue={base.content}
              line={line}
              valueRef={getValue}
              onDirtyChange={changeDirty}
              onSave={(content) => void save(content)}
            />
          </Suspense>
        ) : !current ? (
          <p className="muted small diff-message">読み込み中…</p>
        ) : current.error ? (
          <ErrorText message={current.error} className="diff-message" />
        ) : current.file?.binary ? (
          <p className="muted small diff-message">バイナリのファイルなので、中身は表示できません。</p>
        ) : (
          // data-quote-path・data-no: 右の欄・別ウィンドウで行を選んでチャットに足すとき（useCodeQuoteMenu・SideSelectionAttach）に読む
          <table className="diff-table" data-quote-path={path}>
            <colgroup>
              <col className="diff-col-no" />
              <col />
            </colgroup>
            <tbody>
              {lines.map((text, i) => (
                <tr key={i} ref={i + 1 === line ? focusRef : undefined} className={cx(i + 1 === line && "line-focus")}>
                  <td className="diff-no">{i + 1}</td>
                  <td className="diff-code" data-no={i + 1}>
                    <CodeLine tokens={tokens?.[i]} text={text} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!base && current?.file?.truncated && <p className="muted small diff-message">大きいため、途中までを表示しています（編集はできません）。</p>}
      </div>
    </div>
  );
}
