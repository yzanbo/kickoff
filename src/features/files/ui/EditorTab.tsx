import { useEffect, useEffectEvent, useState } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { baseName } from "@/foundation/ui/lib/format";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { open } from "@/foundation/ui/navigation/open";
import { navigate, type FileTarget } from "@/foundation/ui/navigation/router";
import { storage } from "./storage";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { ListRail } from "@/foundation/ui/kit/ListRail";
import { codeSearchFocus } from "./codeSearchFocus";
import { WorktreePicker } from "@/foundation/ui/workplace/WorktreePicker";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { FilesPane } from "./FilesPane";
import { SearchView } from "./SearchView";
import { openableFolders, parentFolders } from "@/foundation/ui/kit/list/treeModel";
import type { ChangesView } from "./tabSelection";
import { filesGitImpl, useFilesGitStatus } from "./filesGit";
import { FileTabsContext, type FileTabsEnv } from "./ProjectFileTab";
import { useFileTabs } from "./useFileTabs";
import { fileDragProps } from "./fileTabs";
import { Panel } from "@/features/panel/ui/Panel";
import type { PanelFrame } from "@/features/panel/ui/PanelTools";
import type { PanelScope } from "@/features/panel/ui";
import { GitInitNotice } from "@/features/projects/ui/GitInitNotice";
import { useFileOps } from "./useFileOps";
import { FileTreeMenu } from "./FileTreeMenu";
import { useProjectFiles } from "./useProjectFiles";
import { useProjectSearch } from "./useProjectSearch";
import { useSearchReplace } from "./useSearchReplace";
import { WorktreeBar } from "@/features/worktrees/ui/WorktreeBar";

/** 右のファイルのタブの欄は画面そのものなので、閉じる・幅を変えるなどの道具を出さない */
const FIXED_FRAME: PanelFrame = { fixed: true };

/**
 * プロジェクトの「ファイル」「検索」「変更」タブ（VS Code のアクティビティバーと同じく、プロジェクトの左の縦の列で切り替える。view がいまのタブ）。
 * - ファイル（エクスプローラー）: フォルダの木。変更のあるファイルとフォルダだけ色を変える（FilesPane）
 * - 検索: ファイルの中を探す（SearchView）
 * - 変更（ソース管理）: ステージされている変更・変更（未追跡・競合を含む）（ChangesPane）
 * 選んだファイルは右にタブで並べる（useFileTabs。ノートのタブと同じく、ふつうに押すと表示中のタブの中身を入れ替え、⌘クリックで新しいタブ。タブのドラッグで上下・左右に分けられる。
 * 中身は ProjectFileTab）。3 つのタブを行き来しても同じ部品のままなので、開いたファイル・編集中の状態・開いたフォルダ・検索・Git の操作の様子は共有する。履歴は「履歴」タブ（HistoryTab）
 */
export function EditorTab({
  view,
  projectId,
  repoPath,
  worktree,
  onWorktreeChange,
  openFile,
  panelScope,
  inSide = false,
}: {
  /** 左の一覧の表示（いまのタブ） */
  view: ChangesView;
  projectId: number;
  repoPath: string;
  /** 見ている作業場所（ワークツリーのフォルダ。undefined なら本体） */
  worktree?: string;
  onWorktreeChange: (worktree: string | undefined) => void;
  /** 開くファイル（チャットの返答のファイルのチップから。この作業場所のもの） */
  openFile?: FileTarget;
  /** 右のファイルのタブを覚える範囲（なければプロジェクト。チャットの右の欄の中では、その部品ごとの名前） */
  panelScope?: PanelScope;
  /** チャットの右の欄の中（開いたファイルの編集の部品の右クリックのメニューを出さない） */
  inSide?: boolean;
}) {
  const rootName = baseName(worktree ?? repoPath);
  // Git の変更（一覧と差分。開いている間は一定の間隔でも取り直す。同じ作業場所のタブのバッジとは同じ購読）
  const git = useFilesGitStatus({ projectId, worktree: worktree ?? null }, true);
  const { ChangesPane, changeSelection } = filesGitImpl();
  const selection = useFileTabs(projectId, panelScope ?? projectId);
  const { selected, setSelected } = selection;
  // エクスプローラーで開いているフォルダ（表示を切り替えても残す）
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set());
  // Git で管理していないフォルダでも、ファイルの一覧と検索は出す（変更だけ Git の案内にする）
  const files = useProjectFiles(projectId, view === "files" && git.repo !== null, git.version);
  const search = useProjectSearch(projectId);
  // 変更の一覧の操作（ステージ・コミット・プッシュなど）の実行中と失敗（表示を切り替えても残す）
  const gitAction = useAction();
  // ファイル・フォルダの操作（ファイルタブ・変更タブの Enter・右クリック。新しいファイル・ゴミ箱はファイルタブだけ）。フォルダの名前を変えたら、開いていたフォルダも付け替える
  const fileOps = useFileOps(projectId, {
    selection,
    git,
    onMoved: (from, to) =>
      setOpenFolders((prev) => new Set([...prev].map((p) => (p === from || p.startsWith(`${from}/`) ? to + p.slice(from.length) : p)))),
    // 名前の欄・作ったものを見せるため、そのフォルダーとその上を開く
    onReveal: (folder) => setOpenFolders((prev) => new Set([...prev, folder, ...parentFolders(folder)])),
    gitRun: (action, paths) => void gitAction.guard(() => git.act(action, paths)),
  });
  const { rename, create } = fileOps;
  // 検索の結果の置換（すべて・ファイルごと・行ごと。元に戻す）
  const replacer = useSearchReplace(projectId, { search, selection, git });
  // 左の一覧の幅（右端のつまみをドラッグで変える。ダブルクリックで元に戻す。覚えておく）
  const { paneRef: listPaneRef, ...list } = useDragSize({ setting: storage.settings.listWidth, min: 200, keep: 320 });
  // 左の一覧を隠しているか（3 つのタブで共通。隠している間は左端の細い帯 ListRail に戻すボタン）
  const [listHidden, setListHidden] = useSetting(storage.settings.changesListHidden);
  const hideList = () => setListHidden(true);
  // ⌘⇧F（検索の欄にピントを置く頼み）が来たら、隠していた一覧を出す（検索の欄は一覧の中にあるため。頼みは出した SearchView が受け取る）
  const showListForSearch = useEffectEvent(() => {
    if (listHidden) setListHidden(false);
  });
  useEffect(() => {
    if (codeSearchFocus.peek()) showListForSearch();
    return codeSearchFocus.subscribe(showListForSearch);
  }, []);
  // チャットの返答のファイルのチップから来たとき（ファイルタブ）: エクスプローラーでそのファイルを選び（行があればその行へ）、
  // 上のフォルダを開いて、URL からは外す（同じファイルをもう一度押しても開けるように）
  const revealOpenFile = useEffectEvent((path: string, line: number | undefined) => {
    setOpenFolders((prev) => new Set([...prev, ...parentFolders(path)]));
    void setSelected(line ? { path, line } : { path }, true);
    navigate({ name: "project", id: projectId, tab: "files" }, { replace: true });
  });
  useEffect(() => {
    if (openFile) revealOpenFile(openFile.path, openFile.line);
  }, [openFile]);

  if (git.repo === null) {
    return git.error ? <ErrorText message={git.error} /> : <p className="muted small">読み込み中…</p>;
  }
  if (!git.repo && view === "changes") return <GitInitNotice projectId={projectId} onStarted={git.refresh} />;

  const env: FileTabsEnv = { projectId, repoPath, git, inSide, open: (next) => void setSelected(next) };
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
      {worktree && <WorktreeBar projectId={projectId} worktree={worktree} onFinished={() => onWorktreeChange(undefined)} />}
    </div>
    <div className={cx("changes", list.resizing && "resizing")}>
      {listHidden ? (
        <ListRail label={view === "files" ? "ファイルの一覧を表示" : view === "search" ? "検索を表示" : "変更の一覧を表示"} onShow={() => setListHidden(false)} />
      ) : (
      <>
      <aside
        ref={listPaneRef}
        className="changes-list"
        style={{ width: list.size }}
        aria-label={view === "files" ? "すべてのファイル" : view === "search" ? "検索" : "変更のあるファイル"}
      >
        {view === "search" ? (
          <SearchView search={search} root={worktree ?? repoPath} replacer={replacer} selected={selected} onSelect={(path, line, newTab) => void setSelected({ path, line }, newTab)} onHideList={hideList} />
        ) : view === "files" ? (
          <FilesPane
            rootName={rootName}
            git={git}
            files={files}
            marks={git.marks}
            folders={folders}
            selected={selected?.path}
            onSelect={(path, newTab) => void setSelected({ path }, newTab)}
            rename={rename}
            create={create}
            fileDrag={fileDragProps(selection.panel.key, projectId)}
            onHideList={hideList}
          />
        ) : (
          <ChangesPane status={git} action={gitAction} selected={selected} onSelect={(next, newTab) => void setSelected(next, newTab)} rename={rename} onHideList={hideList} />
        )}
      </aside>
      <div className="pane-resizer" aria-label="一覧の幅を変える" {...list.handle} />
      </>
      )}
      {/* 開いたファイルのタブ（中身が使う Git の状態などは FileTabsContext で渡す） */}
      <FileTabsContext.Provider value={env}>
        <Panel panel={selection.panel} frame={FIXED_FRAME} />
      </FileTabsContext.Provider>
    </div>
    <FileTreeMenu
      ops={fileOps}
      root={worktree ?? repoPath}
      explorer={view === "files"}
      // フォルダーの右クリックの「フォルダー内を検索」: 含めるファイルをそのフォルダーにして、検索タブへ
      onFindInFolder={(folder) => {
        search.findInFolder(folder);
        navigate({ name: "project", id: projectId, tab: "search" });
      }}
      // 右クリックの「新しいタブで開く」（変更の一覧からなら、そのまとまりの差分）
      openTab={(path, staged) => void setSelected(staged === undefined ? { path } : changeSelection(git, { path, staged }), true)}
      openInFilesTab={(path) => open({ kind: "file", projectId, path, worktree })}
    />
    </>
  );
}
