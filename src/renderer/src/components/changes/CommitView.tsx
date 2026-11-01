import { useEffect, useState } from "react";
import type { GitCommit, GitCommitDetail, GitFileChange } from "../../../../core/types";
import { api } from "../../api";
import { cx } from "../../cx";
import { errorMessage } from "../../errors";
import { ErrorText } from "../ErrorText";
import { CHANGE_LABELS, DiffView } from "./DiffView";
import { FileIcon } from "./FileIcon";

/**
 * 履歴で選んだコミットの詳細（Fork と同じく、上にメッセージ・作者・日時・変わったファイル、下に選んだファイルの差分）。
 * 初めは 1 つ目のファイルの差分を出す
 */
export function CommitView({ projectId, commit }: { projectId: number; commit: GitCommit }) {
  const [state, setState] = useState<{ hash: string; detail?: GitCommitDetail; error?: string }>();
  const [file, setFile] = useState<GitFileChange>();

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
  // メッセージの 2 行目から（1 行目は見出しに出す）
  const body = detail?.body.split("\n").slice(1).join("\n").trim();

  return (
    <div className="commit-view">
      <section className="commit-meta">
        <h3 className="commit-subject">{commit.subject}</h3>
        {body && <p className="commit-body">{body}</p>}
        <dl className="commit-facts">
          <dt>作者</dt>
          <dd title={commit.email}>{commit.author}</dd>
          <dt>日時</dt>
          <dd>{new Date(commit.date).toLocaleString("ja-JP")}</dd>
          <dt>コミット</dt>
          <dd className="mono">{commit.hash.slice(0, 10)}</dd>
          {commit.parents.length > 0 && (
            <>
              <dt>{commit.parents.length > 1 ? "親（マージ）" : "親"}</dt>
              <dd className="mono">{commit.parents.map((p) => p.slice(0, 7)).join("・")}</dd>
            </>
          )}
        </dl>
        <ErrorText message={state?.hash === commit.hash ? state.error : undefined} />
        {!detail ? (
          !state?.error && <p className="muted small">読み込み中…</p>
        ) : (
          <>
            <p className="muted small commit-files-head">
              {detail.files.length} 個のファイル{commit.parents.length > 1 && "（1 つ目の親との差）"}
            </p>
            <ul className="change-files commit-files">
              {detail.files.map((f) => {
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
          </>
        )}
      </section>
      {file && <DiffView projectId={projectId} file={file} staged={false} version={0} commit={commit.hash} />}
    </div>
  );
}
