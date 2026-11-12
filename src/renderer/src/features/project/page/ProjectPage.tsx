import { useEffect, useState } from "react";
import { KanbanBoard } from "@/features/board/KanbanBoard";
import { EditorTab } from "@/features/editor/EditorTab";
import { HistoryTab } from "@/features/history/HistoryTab";
import { DatabaseClient } from "@/features/database/DatabaseClient";
import { GitHubTab } from "@/features/github/GitHubTab";
import { MemoTab } from "@/features/memo/MemoTab";
import { ChatsTab } from "@/features/panel/board/ChatsTab";
import { useChatPlacement } from "./chatPlacement";
import { useGitStatus } from "@/features/editor/useGitStatus";
import { ProjectEditDialog } from "@/features/project/settings/ProjectEditDialog";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectTabs, useProjectTabsLayout } from "./ProjectTabs";
import { useProjectData } from "./useProjectData";
import { useBusyBadge } from "@/hooks/useBusyBadge";
import { useSetting } from "@/hooks/useSetting";
import { useProjects } from "@/stores/projects";
import { MissingProject, NoProjectsWelcome } from "@/features/project/ProjectsEmpty";
import type { FileTarget, ProjectTab, ReopenRoute } from "@/app/router";
import { editorWorktree } from "@/lib/storageKeys";
import { WorktreeContext } from "@/features/worktree/worktreeContext";

interface ProjectPageProps {
  id: number;
  tab: ProjectTab;
  /** カンバンの右側のパネルで開くチャット・新しいチャット（サイドバー・検索などから開いたとき） */
  focus?: ReopenRoute;
  /** ファイルタブで開くファイル（チャットの返答のファイルのチップから） */
  openFile?: FileTarget;
  /** メモのタブで開くメモ（チャットの「メモに追加」から） */
  openMemo?: string;
  /** そのメモで移る行（⌘K の「メモ内の文言」から） */
  openMemoLine?: number;
}

/**
 * プロジェクト画面: ボード（カンバン）・チャット（ボードと分ける置き方のとき）・ファイル・検索・変更（Git の変更とファイル。文書もここでファイルとして見る）・
 * 履歴（コミット）・メモをタブで
 */
export function ProjectPage(props: ProjectPageProps) {
  // 一覧が届いたのに見つからないプロジェクト（消した・URL の番号が違う）は、前の画面を出さずに案内だけを出す
  // （中身の部品を出さないので、そのプロジェクトのグループ・Git の状態を読みに行かない）。プロジェクトが 1 つもなければ始め方の案内
  const { missing, projects } = useProjects();
  if (missing(props.id))
    return <div className="page page-wide">{projects.length === 0 ? <NoProjectsWelcome /> : <MissingProject id={props.id} />}</div>;
  return <ProjectPageBody {...props} />;
}

function ProjectPageBody({ id, tab: routeTab, focus, openFile, openMemo, openMemoLine }: ProjectPageProps) {
  // チャットをボードの右で開く置き方では「チャット」タブはないので、そのタブの URL はボードで出す
  const [placement] = useChatPlacement();
  // DB・GitHub のタブはこの Mac のアプリの中だけ（ブラウザ・スマホから開いたらボード）
  const tab: ProjectTab = (routeTab === "chats" && placement === "together") || ((routeTab === "db" || routeTab === "github") && !window.kickoff) ? "board" : routeTab;
  const { data: shown, error, loading: chatsLoading } = useProjectData(id);
  const [editing, setEditing] = useState(false);
  // ファイル・検索・変更・履歴タブで見る作業場所（ワークツリーのフォルダ。空なら本体。プロジェクトごとに覚える）
  const [storedWorktree, storeWorktree] = useSetting(editorWorktree(id));
  const worktree = storedWorktree || undefined;
  const setWorktree = (path: string | undefined) => storeWorktree(path ?? "");
  // ファイル・検索・変更のタブ（同じ部品 EditorTab を、左の一覧の表示だけ変えて出す。行き来しても開いたファイルは共有）
  const editorView = tab === "files" || tab === "search" || tab === "changes" ? tab : undefined;
  // Git の変更（変更のタブのバッジに数を出し、ファイル・検索・変更のタブで一覧と差分を出す）
  const git = useGitStatus(id, editorView !== undefined || tab === "history", worktree);
  // タブの数を取り直している最中（更新を知ってから結果が届くまで、数の代わりに更新中の印を出す）
  const refreshing = { chats: useBusyBadge(chatsLoading), changes: useBusyBadge(git.refreshing) };
  // タブの置き方（見出しの下に横並び / 左に縦並び。設定の「表示」）
  const [tabsLayout] = useProjectTabsLayout();
  // 開くファイルが別の作業場所のものなら、先にその作業場所へ切り替える（切り替わってから EditorTab に渡す）
  useEffect(() => {
    if (openFile && openFile.worktree !== worktree) setWorktree(openFile.worktree);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFile]);

  if (error && !shown) return <div className="page error">{error}</div>;
  if (!shown) return <div className="page muted">読み込み中…</div>;
  const { project } = shown;
  // 別のプロジェクトを読み込んでいる途中（前の画面を薄くして出しておく）
  const stale = project.id !== id;

  return (
    <div className={`page page-wide page-board ${stale ? "is-stale" : ""}`}>
      <ProjectHeader data={shown} tab={tab} changeCount={git.count} refreshing={refreshing} onEdit={() => setEditing(true)} />
      {/* タブを左に縦並びにする設定のときは、本体の左にアイコンだけで並べる（見出しの下の行がなくなり、本体の縦の幅が増える） */}
      <div className="project-main">
      {tabsLayout === "side" && <ProjectTabs projectId={project.id} tab={tab} changeCount={git.count} refreshing={refreshing} vertical />}
      <div className="project-content">

      {tab === "board" && <KanbanBoard projectId={project.id} focus={focus} />}
      {/* ボードと分けたチャット（ボードの右のパネルと同じパネルを横幅いっぱいに） */}
      {tab === "chats" && <ChatsTab key={project.id} projectId={project.id} focus={stale ? undefined : focus} />}
      {editorView && (
        <WorktreeContext.Provider value={worktree}>
          {/* 作業場所を変えたら、選んでいたファイル・検索などは初めからにする（ファイル・検索・変更のタブの間では同じ部品のまま） */}
          <EditorTab
            key={worktree ?? ""}
            view={editorView}
            projectId={project.id}
            repoPath={project.repo_path}
            git={git}
            worktree={worktree}
            onWorktreeChange={setWorktree}
            // 別のプロジェクトを読み込んでいる途中・作業場所を切り替える前は渡さない
            openFile={!stale && openFile?.worktree === worktree ? openFile : undefined}
          />
        </WorktreeContext.Provider>
      )}
      {tab === "history" && (
        <WorktreeContext.Provider value={worktree}>
          <HistoryTab key={worktree ?? ""} projectId={project.id} git={git} worktree={worktree} onWorktreeChange={setWorktree} />
        </WorktreeContext.Provider>
      )}
      {/* メモ（プロジェクトの外のフォルダ。作業場所には関係しない）。別のプロジェクトを読み込んでいる途中は、URL で来たメモを渡さない */}
      {tab === "memos" && <MemoTab key={project.id} projectId={project.id} openMemo={stale ? undefined : openMemo} openMemoLine={openMemoLine} />}
      {/* DB クライアント（SQLite のファイルは、ファイル・検索・変更・履歴のタブで選んだ作業場所の中を開く） */}
      {tab === "db" && <DatabaseClient key={project.id} projectId={project.id} place={`project-${project.id}`} worktree={worktree ?? null} />}
      {/* GitHub（連携先のリポジトリの issue・PR を読む） */}
      {tab === "github" && <GitHubTab key={project.id} projectId={project.id} />}
      </div>
      </div>
      {editing && <ProjectEditDialog project={project} onClose={() => setEditing(false)} />}
    </div>
  );
}
