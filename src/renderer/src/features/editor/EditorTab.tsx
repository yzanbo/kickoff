import { useEffect, useMemo, useState } from "react";
import { cx } from "@/lib/cx";
import { baseName } from "@/lib/format";
import { useAction } from "@/hooks/useAction";
import type { CommitBusy } from "./useCommitActions";
import { useDragSize } from "@/hooks/useDragSize";
import { navigate, type FileTarget } from "@/app/router";
import { CHANGES_LIST_WIDTH } from "@/lib/storageKeys";
import { WorktreePicker } from "@/features/worktree/WorktreePicker";
import { ErrorText } from "@/ui/ErrorText";
import { ChangesPane } from "./ChangesPane";
import { FilesPane } from "./FilesPane";
import { SearchView } from "./SearchView";
import { changeKinds, openableFolders, parentFolders } from "./treeModel";
import { changeSelection, type ChangesView } from "./fileSelection";
import { FileTabsContext, type FileTabsEnv } from "./ProjectFileTab";
import { useFileTabs } from "./useFileTabs";
import { fileDragProps } from "./fileTabs";
import { Panel } from "@/features/panel/Panel";
import type { PanelFrame } from "@/features/panel/PanelTools";
import type { PanelScope } from "@/features/panel/surfaces";
import type { GitStatusController } from "./useGitStatus";
import { GitInitNotice } from "@/features/project/GitInitNotice";
import { useFileActions } from "./useFileActions";
import { useProjectFiles } from "./useProjectFiles";
import { useProjectSearch } from "./useProjectSearch";
import { useSearchReplace } from "./useSearchReplace";
import { WorktreeBar } from "@/features/worktree/WorktreeBar";

/** 右のファイルのタブの欄は画面そのものなので、閉じる・幅を変えるなどの道具を出さない */
const FIXED_FRAME: PanelFrame = { fixed: true };

/**
 * プロジェクトの「ファイル」「検索」「変更」タブ（VS Code のアクティビティバーと同じく、プロジェクトの左の縦の列で切り替える。view がいまのタブ）。
 * - ファイル（エクスプローラー）: フォルダの木。変更のあるファイルとフォルダだけ色を変える（FilesPane）
 * - 検索: ファイルの中を探す（SearchView）
 * - 変更（ソース管理）: ステージされている変更・変更（未追跡・競合を含む）（ChangesPane）
 * 選んだファイルは右にタブで並べる（useFileTabs。メモのタブと同じく、ふつうに押すと表示中のタブの中身を入れ替え、⌘クリックで新しいタブ。タブのドラッグで上下・左右に分けられる。
 * 中身は ProjectFileTab）。3 つのタブを行き来しても同じ部品のままなので、開いたファイル・編集中の状態・開いたフォルダ・検索・Git の操作の様子は共有する。履歴は「履歴」タブ（HistoryTab）
 */
export function EditorTab({
  view,
  projectId,
  repoPath,
  git,
  worktree,
  onWorktreeChange,
  openFile,
  panelScope,
}: {
  /** 左の一覧の表示（いまのタブ） */
  view: ChangesView;
  projectId: number;
  repoPath: string;
  git: GitStatusController;
  /** 見ている作業場所（ワークツリーのフォルダ。undefined なら本体） */
  worktree?: string;
  onWorktreeChange: (worktree: string | undefined) => void;
  /** 開くファイル（チャットの返答のファイルのチップから。この作業場所のもの） */
  openFile?: FileTarget;
  /** 右のファイルのタブを覚える範囲（なければプロジェクト。チャットの右の欄の中では、その部品ごとの名前） */
  panelScope?: PanelScope;
}) {
  const rootName = baseName(worktree ?? repoPath);
  const { status } = git;
  const selection = useFileTabs(projectId, panelScope ?? projectId);
  const { selected, setSelected } = selection;
  // エクスプローラーで開いているフォルダ（表示を切り替えても残す）
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set());
  const files = useProjectFiles(projectId, view === "files" && Boolean(status?.repo), git.version);
  const kinds = useMemo(() => changeKinds(status), [status]);
  const search = useProjectSearch(projectId);
  // ファイル・フォルダの操作（ファイルタブ・変更タブの Enter・右クリック。新しいファイル・ゴミ箱はファイルタブだけ）。フォルダの名前を変えたら、開いていたフォルダも付け替える
  const { rename, create, menuElement: fileMenu } = useFileActions(projectId, {
    root: worktree ?? repoPath,
    explorer: view === "files",
    selection,
    git,
    onMoved: (from, to) =>
      setOpenFolders((prev) => new Set([...prev].map((p) => (p === from || p.startsWith(`${from}/`) ? to + p.slice(from.length) : p)))),
    // 名前の欄・作ったものを見せるため、そのフォルダーとその上を開く
    onReveal: (folder) => setOpenFolders((prev) => new Set([...prev, folder, ...parentFolders(folder)])),
    // フォルダーの右クリックの「フォルダー内を検索」: 含めるファイルをそのフォルダーにして、検索タブへ
    onFindInFolder: (folder) => {
      search.findInFolder(folder);
      navigate({ name: "project", id: projectId, tab: "search" });
    },
  });
  // 検索の結果の置換（すべて・ファイルごと・行ごと。元に戻す）
  const replacer = useSearchReplace(projectId, { search, selection, git });
  // 変更の一覧の操作（ステージ・コミット・プッシュなど）の実行中と失敗（表示を切り替えても残す）
  const gitAction = useAction<CommitBusy>();
  // 左の一覧の幅（右端のつまみをドラッグで変える。ダブルクリックで元に戻す。覚えておく）
  const list = useDragSize({ setting: CHANGES_LIST_WIDTH, min: 200, keep: 320 });
  // チャットの返答のファイルのチップから来たとき（ファイルタブ）: エクスプローラーでそのファイルを選び（行があればその行へ）、
  // 上のフォルダを開いて、URL からは外す（同じファイルをもう一度押しても開けるように）
  useEffect(() => {
    if (!openFile) return;
    const { path, line } = openFile;
    setOpenFolders((prev) => new Set([...prev, ...parentFolders(path)]));
    void setSelected(line ? { path, line } : { path }, true);
    navigate({ name: "project", id: projectId, tab: "files" }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFile]);

  if (!status) {
    return git.error ? <ErrorText message={git.error} /> : <p className="muted small">読み込み中…</p>;
  }
  if (!status.repo) return <GitInitNotice projectId={projectId} onStarted={git.refresh} />;

  const groups = { staged: status.staged, unstaged: [...status.conflicts, ...status.unstaged] };
  const empty = groups.staged.length === 0 && groups.unstaged.length === 0;
  const env: FileTabsEnv = { projectId, repoPath, git, groups, open: (next) => void setSelected(next) };
  const folders = {
    open: openFolders,
    toggle: (path: string) =>
      setOpenFolders((prev) => {
        const next = new Set(prev);
        if (!next.delete(path)) next.add(path);
        return next;
      }),
    // すべて開く（無視しているフォルダは開かない）
    openAll: () => setOpenFolders(new Set(openableFolders(files.tree ?? []))),
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
      <aside
        ref={list.paneRef}
        className="changes-list"
        style={{ width: list.size }}
        aria-label={view === "files" ? "すべてのファイル" : view === "search" ? "検索" : "変更のあるファイル"}
      >
        {view === "search" ? (
          <SearchView search={search} replacer={replacer} selected={selected} onSelect={(path, line, newTab) => void setSelected({ path, line }, newTab)} />
        ) : view === "files" ? (
          <FilesPane
            rootName={rootName}
            git={git}
            files={files}
            kinds={kinds}
            folders={folders}
            selected={selected?.path}
            onSelect={(path, newTab) => void setSelected({ path }, newTab)}
            rename={rename}
            create={create}
            fileDrag={fileDragProps(selection.panel.key, projectId)}
          />
        ) : (
          <ChangesPane
            status={status}
            git={git}
            groups={groups}
            empty={empty}
            action={gitAction}
            selected={selected}
            onSelect={(next, newTab) => void setSelected(changeSelection(next, groups), newTab)}
            rename={rename}
          />
        )}
      </aside>
      <div className="pane-resizer" aria-label="一覧の幅を変える" {...list.handle} />
      {/* 開いたファイルのタブ（中身が使う Git の状態などは FileTabsContext で渡す） */}
      <FileTabsContext.Provider value={env}>
        <Panel panel={selection.panel} frame={FIXED_FRAME} />
      </FileTabsContext.Provider>
    </div>
    {fileMenu}
    </>
  );
}
