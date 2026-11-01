import { ArrowDown, ArrowUp, ChevronsDownUp, Files, GitBranch, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { GitFileChange } from "../../../../core/types";
import { cx } from "../../cx";
import { confirmDialog } from "../../dialogs";
import { useStoredChoice } from "../../hooks/useStoredState";
import { Chevron } from "../Chevron";
import { ErrorText } from "../ErrorText";
import { IconButton, RefreshButton } from "../IconButton";
import { Segmented } from "../Segmented";
import { CHANGE_LABELS, DiffView } from "./DiffView";
import { FileIcon } from "./FileIcon";
import { FileTree } from "./FileTree";
import { FileView } from "./FileView";
import { SearchView } from "./SearchView";
import { changeKinds } from "./treeModel";
import type { GitStatusController } from "./useGitStatus";
import { useProjectFiles } from "./useProjectFiles";
import { useProjectSearch } from "./useProjectSearch";

/**
 * 選んでいるファイル。変更の一覧から選んだときは、ステージ済み・未ステージのどちらか（同じファイルが両方にあることもある）。
 * エクスプローラーから選んだときは staged を持たない（変更があれば差分、なければ中身を出す）。
 * 検索の結果から選んだときは line を持つ（変更があってもいまの中身を出し、その行を目立たせる）。
 * edit は、差分の「編集」から来たとき（いまの中身を開いてすぐ編集する）
 */
interface Selection {
  path: string;
  staged?: boolean;
  line?: number;
  edit?: boolean;
}

type ChangesView = "files" | "search" | "changes";
const VIEW_KEY = "kickoff:changes-view";

/**
 * プロジェクトの「変更」タブ（VS Code と同じく、左端で表示を切り替える）。
 * - すべてのファイル（エクスプローラー）: フォルダの木。変更のあるファイルとフォルダだけ色を変える
 * - 検索: ファイルの中を探す
 * - 変更（ソース管理）: ステージされている変更・変更（未追跡・競合を含む）
 * ファイルを選ぶと、変更があれば差分、なければ中身を右に出す
 */
export function ChangesTab({ projectId, repoPath, git }: { projectId: number; repoPath: string; git: GitStatusController }) {
  const rootName = repoPath.split("/").pop() ?? repoPath;
  const { status } = git;
  const [view, setView] = useStoredChoice<ChangesView>(VIEW_KEY, ["files", "search", "changes"], "changes");
  const [selected, setSelectedState] = useState<Selection>();
  // 編集中のファイルに保存していない変更があるか（別のファイルを開く前に確かめる）
  const dirty = useRef(false);
  const setSelected = async (next: Selection) => {
    if (
      dirty.current &&
      !(await confirmDialog({ title: "保存していない変更があります", message: "別のファイルを開くと、変更は消えます。", confirmLabel: "変更を捨てて開く", danger: true }))
    )
      return;
    dirty.current = false;
    setSelectedState(next);
  };
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set());
  const files = useProjectFiles(projectId, view === "files" && Boolean(status?.repo), git.version);
  const kinds = useMemo(() => changeKinds(status), [status]);
  const search = useProjectSearch(projectId);

  if (!status) {
    return git.error ? <ErrorText message={git.error} /> : <p className="muted small">読み込み中…</p>;
  }
  if (!status.repo) return <p className="muted small">このプロジェクトのフォルダは、Git で管理されていません。</p>;

  const groups = { staged: status.staged, unstaged: [...status.conflicts, ...status.unstaged] };
  const empty = groups.staged.length === 0 && groups.unstaged.length === 0;
  const find = (list: GitFileChange[], path: string) => list.find((f) => f.path === path);
  // 選んだファイルの差分（エクスプローラーから選んだときは、未ステージ → ステージ済みの順に探す）
  const change: { file: GitFileChange; staged: boolean } | undefined = (() => {
    if (!selected || selected.line !== undefined || selected.edit) return undefined;
    const unstaged = selected.staged !== true ? find(groups.unstaged, selected.path) : undefined;
    if (unstaged) return { file: unstaged, staged: false };
    const staged = selected.staged !== false ? find(groups.staged, selected.path) : undefined;
    return staged && { file: staged, staged: true };
  })();
  // ファイルの中身の表示・編集に渡すもの
  const fileViewProps = (path: string) => ({
    projectId,
    repoPath,
    path,
    version: git.version,
    onSaved: () => void git.refresh(),
    onDirtyChange: (next: boolean) => (dirty.current = next),
  });
  const toggleFolder = (path: string) =>
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  return (
    <div className="changes">
      {/* 左端の表示の切り替え（VS Code のアクティビティバーと同じ） */}
      <Segmented
        className="changes-activity"
        label="左側の表示"
        value={view}
        onChange={setView}
        iconSize={18}
        options={[
          { value: "files", label: "すべてのファイル（エクスプローラー）", icon: Files, iconOnly: true },
          { value: "search", label: "検索", icon: Search, iconOnly: true },
          { value: "changes", label: "変更（ソース管理）", icon: GitBranch, iconOnly: true, badge: git.count },
        ]}
      />
      <aside className="changes-list" aria-label={view === "files" ? "すべてのファイル" : view === "search" ? "検索" : "変更のあるファイル"}>
        {view === "search" ? (
          <SearchView search={search} selected={selected} onSelect={(path, line) => void setSelected({ path, line })} />
        ) : view === "files" ? (
          <>
            <header className="changes-head">
              <span className="changes-branch" title={rootName}>
                {rootName}
              </span>
              <span className="spacer" />
              <RefreshButton label="ファイルの一覧を取り直す" busy={git.loading} onClick={() => void git.refresh()} />
              <IconButton icon={ChevronsDownUp} label="フォルダをすべて閉じる" disabled={openFolders.size === 0} onClick={() => setOpenFolders(new Set())} />
            </header>
            <ErrorText message={files.error} />
            {files.tree ? (
              <FileTree
                nodes={files.tree}
                open={openFolders}
                onToggle={toggleFolder}
                selected={selected?.path}
                onSelect={(path) => void setSelected({ path })}
                kinds={kinds}
              />
            ) : (
              !files.error && <p className="muted small changes-empty">読み込み中…</p>
            )}
            {files.truncated && <p className="muted small changes-empty">ファイルが多いため、途中までを表示しています。</p>}
          </>
        ) : (
          <>
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
                  <ChangeGroup title="ステージされている変更" files={groups.staged} staged selected={selected} onSelect={(next) => void setSelected(next)} />
                )}
                <ChangeGroup title="変更" files={groups.unstaged} staged={false} selected={selected} onSelect={(next) => void setSelected(next)} />
              </>
            )}
          </>
        )}
      </aside>
      <div className="changes-diff">
        {selected && (selected.line !== undefined || selected.edit) ? (
          <FileView
            key={`${selected.path}:${selected.line ?? ""}:${selected.edit ? "edit" : ""}`}
            {...fileViewProps(selected.path)}
            line={selected.line}
            changed={kinds.files.has(selected.path)}
            initialEditing={selected.edit}
          />
        ) : change ? (
          <DiffView
            projectId={projectId}
            file={change.file}
            staged={change.staged}
            version={git.version}
            onEdit={change.file.kind === "D" ? undefined : () => void setSelected({ path: change.file.path, edit: true })}
          />
        ) : selected && selected.staged === undefined ? (
          <FileView key={selected.path} {...fileViewProps(selected.path)} />
        ) : (
          <p className="muted small changes-hint">
            {view === "changes" && empty ? "コミットしていない変更はありません。" : "ファイルを選ぶと、変更があれば差分、なければ中身を表示します。"}
          </p>
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
                  <FileIcon name={file.path.slice(slash + 1)} />
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
