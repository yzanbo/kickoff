import { ArrowDown, ArrowUp, GitBranch } from "lucide-react";
import { useState } from "react";
import type { GitFileChange } from "../../../../core/types";
import { cx } from "../../cx";
import { Chevron } from "../Chevron";
import { ErrorText } from "../ErrorText";
import { RefreshButton } from "../IconButton";
import { CHANGE_LABELS, DiffView } from "./DiffView";
import type { GitStatusController } from "./useGitStatus";

/** 選んでいるファイル（同じファイルがステージ済みと未ステージの両方にあることもあるので、どちらかも持つ） */
interface Selection {
  path: string;
  staged: boolean;
}

/**
 * プロジェクトの「変更」タブ: VS Code のソース管理と同じく、ステージされている変更・変更（未追跡を含む）を並べ、
 * ファイルを選ぶとその差分を右に出す
 */
export function ChangesTab({ projectId, git }: { projectId: number; git: GitStatusController }) {
  const { status } = git;
  const [selected, setSelected] = useState<Selection>();

  if (!status) {
    return git.error ? <ErrorText message={git.error} /> : <p className="muted small">読み込み中…</p>;
  }
  if (!status.repo) return <p className="muted small">このプロジェクトのフォルダは、Git で管理されていません。</p>;

  // 選んでいたファイルが一覧からなくなったら（コミットした・元に戻したなど）、選ぶのをやめる
  const groups = { staged: status.staged, unstaged: [...status.conflicts, ...status.unstaged] };
  const selectedFile = selected && (selected.staged ? groups.staged : groups.unstaged).find((f) => f.path === selected.path);
  const empty = groups.staged.length === 0 && groups.unstaged.length === 0;

  return (
    <div className="changes">
      <aside className="changes-list" aria-label="変更のあるファイル">
        <header className="changes-head">
          <GitBranch size={14} aria-hidden />
          <span className="changes-branch" title="いまのブランチ">
            {status.branch ?? "（ブランチなし）"}
          </span>
          {status.ahead > 0 && (
            <span className="changes-sync" title={`リモートより ${status.ahead} 件進んでいます`}>
              <ArrowUp size={11} aria-hidden />
              {status.ahead}
            </span>
          )}
          {status.behind > 0 && (
            <span className="changes-sync" title={`リモートより ${status.behind} 件遅れています`}>
              <ArrowDown size={11} aria-hidden />
              {status.behind}
            </span>
          )}
          <span className="spacer" />
          <RefreshButton label="変更を取り直す" busy={git.loading} onClick={() => void git.refresh()} />
        </header>
        <ErrorText message={git.error} />
        {empty ? (
          <p className="muted small changes-empty">変更はありません。</p>
        ) : (
          <>
            {groups.staged.length > 0 && (
              <ChangeGroup title="ステージされている変更" files={groups.staged} staged selected={selected} onSelect={setSelected} />
            )}
            <ChangeGroup title="変更" files={groups.unstaged} staged={false} selected={selected} onSelect={setSelected} />
          </>
        )}
      </aside>
      <div className="changes-diff">
        {selected && selectedFile ? (
          <DiffView projectId={projectId} file={selectedFile} staged={selected.staged} version={git.version} />
        ) : (
          <p className="muted small changes-hint">{empty ? "コミットしていない変更はありません。" : "ファイルを選ぶと、差分を表示します。"}</p>
        )}
      </div>
    </div>
  );
}

/** 「ステージされている変更」「変更」のまとまり（見出しで開閉。数をバッジで出す） */
function ChangeGroup({
  title,
  files,
  staged,
  selected,
  onSelect,
}: {
  title: string;
  files: GitFileChange[];
  staged: boolean;
  selected?: Selection;
  onSelect: (selection: Selection) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="change-group">
      <button className="change-group-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <span className="change-group-title">{title}</span>
        <span className="change-count" aria-label={`${files.length} 件`}>
          {files.length}
        </span>
      </button>
      {open && (
        <ul className="change-files">
          {files.map((file) => {
            const slash = file.path.lastIndexOf("/");
            const isSelected = selected?.staged === staged && selected.path === file.path;
            return (
              <li key={file.path}>
                <button
                  className={cx("change-file", isSelected && "selected")}
                  aria-current={isSelected || undefined}
                  title={`${file.path}（${CHANGE_LABELS[file.kind]}）`}
                  onClick={() => onSelect({ path: file.path, staged })}
                >
                  <span className={cx("change-name", file.kind === "D" && "deleted")}>{file.path.slice(slash + 1)}</span>
                  {slash > 0 && <span className="change-dir">{file.path.slice(0, slash)}</span>}
                  <span className="change-kind" data-kind={file.kind} aria-label={CHANGE_LABELS[file.kind]}>
                    {file.kind}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
