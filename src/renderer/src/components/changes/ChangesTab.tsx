import { Files, GitBranch, History, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GitCommit } from "../../../../core/types";
import { cx } from "../../cx";
import { baseName } from "../../format";
import { useActionError } from "../../hooks/useActionError";
import { useDragWidth } from "../../hooks/useDragWidth";
import { useStoredChoice } from "../../hooks/useStoredState";
import { navigate, type FileTarget } from "../../router";
import { CHANGES_LIST_WIDTH_KEY, CHANGES_VIEW_KEY } from "../../storageKeys";
import { WorktreePicker } from "../../worktree/WorktreePicker";
import { ErrorText } from "../ErrorText";
import { Segmented } from "../Segmented";
import { ChangesDetail } from "./ChangesDetail";
import { ChangesPane } from "./ChangesPane";
import { FilesPane } from "./FilesPane";
import { HistorySidebar } from "./HistoryView";
import { SearchView } from "./SearchView";
import { changeKinds, parentFolders } from "./treeModel";
import { selectedChange, useChangesSelection, type ChangesView } from "./useChangesSelection";
import { useGitLog } from "./useGitLog";
import type { GitStatusController } from "./useGitStatus";
import { useProjectFiles } from "./useProjectFiles";
import { useProjectSearch } from "./useProjectSearch";
import { WorktreeBar } from "./WorktreeBar";

/**
 * プロジェクトの「エディタ」タブ（VS Code と同じく、左端で表示を切り替える）。
 * - すべてのファイル（エクスプローラー）: フォルダの木。変更のあるファイルとフォルダだけ色を変える（FilesPane）
 * - 検索: ファイルの中を探す（SearchView）
 * - 変更（ソース管理）: ステージされている変更・変更（未追跡・競合を含む）（ChangesPane）
 * - 履歴: ブランチなどの一覧（HistorySidebar）
 * ファイルを選ぶと、変更があれば差分、なければ中身を右に出す（ChangesDetail）
 */
export function ChangesTab({
  projectId,
  repoPath,
  git,
  worktree,
  onWorktreeChange,
  openFile,
}: {
  projectId: number;
  repoPath: string;
  git: GitStatusController;
  /** 見ている作業場所（ワークツリーのフォルダ。undefined なら本体） */
  worktree?: string;
  onWorktreeChange: (worktree: string | undefined) => void;
  /** 開くファイル（チャットの返答のファイルのチップから。この作業場所のもの） */
  openFile?: FileTarget;
}) {
  const rootName = baseName(worktree ?? repoPath);
  const { status } = git;
  const [view, setView] = useStoredChoice<ChangesView>(CHANGES_VIEW_KEY, ["files", "search", "changes", "history"], "history");
  const selection = useChangesSelection();
  const { selected, setSelected } = selection;
  // エクスプローラーで開いているフォルダ（表示を切り替えても残す）
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set());
  const files = useProjectFiles(projectId, view === "files" && Boolean(status?.repo), git.version);
  const kinds = useMemo(() => changeKinds(status), [status]);
  const search = useProjectSearch(projectId);
  // 履歴（Fork のようにブランチの線つき）と、選んだコミット
  const log = useGitLog(projectId, view === "history" && Boolean(status?.repo), git.version);
  const [picked, setPicked] = useState<{ projectId: number; commit: GitCommit }>();
  // 別のプロジェクトに切り替えたら、選んでいたコミットは外す（ほかのリポジトリにはない）
  const commit = picked?.projectId === projectId ? picked.commit : undefined;
  const setCommit = (next: GitCommit) => setPicked({ projectId, commit: next });
  const actionError = useActionError();
  // 左の一覧の幅（右端のつまみをドラッグで変える。ダブルクリックで元に戻す。覚えておく）
  const list = useDragWidth({ storageKey: CHANGES_LIST_WIDTH_KEY, initial: 246 });
  // チャットの返答のファイルのチップから来たとき: エクスプローラーでそのファイルを選び（行があればその行へ）、
  // 上のフォルダを開いて、URL からは外す（同じファイルをもう一度押しても開けるように）
  useEffect(() => {
    if (!openFile) return;
    const { path, line } = openFile;
    setView("files");
    setOpenFolders((prev) => new Set([...prev, ...parentFolders(path)]));
    void setSelected(line ? { path, line } : { path });
    navigate({ name: "project", id: projectId, tab: "changes" }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFile]);

  if (!status) {
    return git.error ? <ErrorText message={git.error} /> : <p className="muted small">読み込み中…</p>;
  }
  if (!status.repo) return <p className="muted small">このプロジェクトのフォルダは、Git で管理されていません。</p>;

  const groups = { staged: status.staged, unstaged: [...status.conflicts, ...status.unstaged] };
  const empty = groups.staged.length === 0 && groups.unstaged.length === 0;
  const change = selectedChange(selected, groups);
  const folders = {
    open: openFolders,
    toggle: (path: string) =>
      setOpenFolders((prev) => {
        const next = new Set(prev);
        if (!next.delete(path)) next.add(path);
        return next;
      }),
    closeAll: () => setOpenFolders(new Set()),
  };

  return (
    <>
    {/* 作業場所（本体・ワークツリー）の切り替え。ワークツリーが本体だけなら空（CSS で隠す） */}
    <div className="changes-bar">
      <WorktreePicker projectId={projectId} value={worktree} onChange={onWorktreeChange} version={git.version} />
      {/* ワークツリーの作業の流れ（PR を作る・PR の状態・マージされたら片付ける） */}
      {worktree && <WorktreeBar projectId={projectId} worktree={worktree} git={git} onFinished={() => onWorktreeChange(undefined)} />}
    </div>
    <div className={cx("changes", list.resizing && "resizing")}>
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
          { value: "history", label: "履歴", icon: History, iconOnly: true },
        ]}
      />
      <aside
        ref={list.paneRef}
        className="changes-list"
        style={{ width: list.width }}
        aria-label={view === "files" ? "すべてのファイル" : view === "search" ? "検索" : view === "history" ? "履歴" : "変更のあるファイル"}
      >
        {view === "history" ? (
          <HistorySidebar
            projectId={projectId}
            log={log}
            onPick={(hash) => {
              const found = log.commits?.find((c) => c.hash === hash);
              if (found) setCommit(found);
            }}
          />
        ) : view === "search" ? (
          <SearchView search={search} selected={selected} onSelect={(path, line) => void setSelected({ path, line })} />
        ) : view === "files" ? (
          <FilesPane rootName={rootName} git={git} files={files} kinds={kinds} folders={folders} selected={selected?.path} onSelect={(path) => void setSelected({ path })} />
        ) : (
          <ChangesPane status={status} git={git} groups={groups} empty={empty} actionError={actionError} selected={selected} onSelect={(next) => void setSelected(next)} />
        )}
      </aside>
      <div className="pane-resizer" aria-label="一覧の幅を変える" {...list.handle} />
      <ChangesDetail
        view={view}
        projectId={projectId}
        repoPath={repoPath}
        git={git}
        log={log}
        commit={commit}
        onSelectCommit={setCommit}
        selection={selection}
        change={change}
        kinds={kinds}
        empty={empty}
      />
    </div>
    </>
  );
}
