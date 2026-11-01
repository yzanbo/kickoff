import { List, ListTree } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GitCommit, GitCommitDetail, GitFileChange } from "../../../../core/types";
import { api } from "../../api";
import { cx } from "../../cx";
import { errorMessage } from "../../errors";
import { useStoredFlag } from "../../hooks/useStoredState";
import { formatDayTime } from "../../time";
import { ErrorText } from "../ErrorText";
import { IconButton } from "../IconButton";
import { Segmented } from "../Segmented";
import { CHANGE_LABELS, DiffView } from "./DiffView";
import { FileIcon } from "./FileIcon";
import { FileTree } from "./FileTree";
import { buildTree, folderPaths, kindMaps } from "./treeModel";

type CommitTab = "commit" | "changes";
const TREE_KEY = "kickoff:commit-files-tree";

/**
 * 履歴で選んだコミットの詳細（Fork と同じ: 1 行の見出しと「コミット」「変更」のタブ）。
 * 変更: 左に変わったファイル（木・一覧）、右に選んだファイルの差分。初めは 1 つ目のファイルの差分を出す
 */
export function CommitView({ projectId, commit }: { projectId: number; commit: GitCommit }) {
  const [state, setState] = useState<{ hash: string; detail?: GitCommitDetail; error?: string }>();
  const [file, setFile] = useState<GitFileChange>();
  const [tab, setTab] = useState<CommitTab>("changes");
  // 変わったファイルを木で出すか（初めは木。Fork と同じ）
  const [list, setList] = useStoredFlag(TREE_KEY);

  useEffect(() => {
    let alive = true;
    setFile(undefined);
    api.gitCommitDetail(projectId, commit.hash).then(
      (detail) => {
        if (!alive) return;
        setState({ hash: commit.hash, detail });
        setFile(detail.files[0]);
      },
      (e: unknown) => alive && setState({ hash: commit.hash, error: errorMessage(e) }),
    );
    return () => {
      alive = false;
    };
  }, [projectId, commit.hash]);

  const detail = state?.hash === commit.hash ? state.detail : undefined;
  const files = useMemo(() => detail?.files ?? [], [detail]);
  const nodes = useMemo(() => buildTree({ files: files.map((f) => f.path), ignored: [] }), [files]);
  const kinds = useMemo(() => kindMaps(files), [files]);
  // 木で閉じたフォルダ（初めは全部開いておく）
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const openFolders = useMemo(() => new Set(folderPaths(nodes).filter((p) => !closed.has(p))), [nodes, closed]);

  return (
    <div className="commit-view">
      <header className="commit-line">
        <span className="commit-author" title={commit.email}>
          {commit.author}
        </span>
        <span className="history-hash">{commit.hash.slice(0, 9)}</span>
        <span className="muted">{formatDayTime(commit.date)}</span>
        <span className="commit-line-subject" title={commit.subject}>
          {commit.subject}
        </span>
        <Segmented
          className="view-toggle"
          label="コミットの詳細の表示"
          value={tab}
          onChange={setTab}
          options={[
            { value: "commit", label: "コミット" },
            { value: "changes", label: "変更" },
          ]}
        />
      </header>
      <ErrorText message={state?.hash === commit.hash ? state.error : undefined} className="code-search-message" />
      {tab === "commit" ? (
        <section className="commit-meta">
          <h3 className="commit-subject">{commit.subject}</h3>
          {detail && detail.body.split("\n").slice(1).join("\n").trim() && <p className="commit-body">{detail.body.split("\n").slice(1).join("\n").trim()}</p>}
          <dl className="commit-facts">
            <dt>作者</dt>
            <dd>
              {commit.author}（{commit.email}）
            </dd>
            <dt>日時</dt>
            <dd>{new Date(commit.date).toLocaleString("ja-JP")}</dd>
            {detail && detail.committer !== commit.author && (
              <>
                <dt>コミットした人</dt>
                <dd>{detail.committer}</dd>
              </>
            )}
            <dt>コミット</dt>
            <dd className="mono">{commit.hash}</dd>
            {commit.parents.length > 0 && (
              <>
                <dt>{commit.parents.length > 1 ? "親（マージ）" : "親"}</dt>
                <dd className="mono">{commit.parents.map((p) => p.slice(0, 9)).join("・")}</dd>
              </>
            )}
            <dt>変わったファイル</dt>
            <dd>{detail ? `${files.length} 個${commit.parents.length > 1 ? "（1 つ目の親との差）" : ""}` : "読み込み中…"}</dd>
          </dl>
        </section>
      ) : (
        <div className="commit-changes">
          <aside className="commit-files">
            <div className="commit-files-head">
              <span className="muted small">{detail ? `${files.length} 個のファイル` : "読み込み中…"}</span>
              <span className="spacer" />
              <IconButton icon={list ? ListTree : List} label={list ? "ツリーで表示" : "一覧で表示"} size={14} onClick={() => setList(!list)} />
            </div>
            {list ? (
              <ul className="change-files">
                {files.map((f) => {
                  const slash = f.path.lastIndexOf("/");
                  const name = f.path.slice(slash + 1);
                  const selected = file?.path === f.path;
                  return (
                    <li key={f.path}>
                      <button
                        className={cx("change-file", selected && "selected")}
                        aria-current={selected || undefined}
                        title={`${f.path}（${CHANGE_LABELS[f.kind]}）`}
                        onClick={() => setFile(f)}
                      >
                        <FileIcon name={name} />
                        <span className={cx("change-name", f.kind === "D" && "deleted")}>{name}</span>
                        {slash > 0 && <span className="change-dir">{f.path.slice(0, slash)}</span>}
                        <span className="change-kind" data-kind={f.kind}>
                          {f.kind}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <FileTree
                nodes={nodes}
                open={openFolders}
                onToggle={(path) =>
                  setClosed((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(path)) next.add(path);
                    return next;
                  })
                }
                selected={file?.path}
                onSelect={(path) => setFile(files.find((f) => f.path === path))}
                kinds={kinds}
              />
            )}
          </aside>
          {file ? (
            <DiffView projectId={projectId} file={file} staged={false} version={0} commit={commit.hash} />
          ) : (
            <p className="muted small changes-hint">ファイルを選ぶと、差分を表示します。</p>
          )}
        </div>
      )}
    </div>
  );
}
