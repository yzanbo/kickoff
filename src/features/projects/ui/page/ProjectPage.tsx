import { useEffect, useEffectEvent, useState } from "react";
import { KanbanBoard } from "@/features/board/ui/KanbanBoard";
import { EditorTab } from "@/features/files/ui/EditorTab";
import { HistoryTab } from "@/features/git/ui/history/HistoryTab";
import { LazyDatabaseClient } from "@/features/database/ui/LazyDatabaseClient";
import { GitHubTab } from "@/features/github/ui/GitHubTab";
import { DockerTab } from "@/features/docker/ui/DockerTab";
import { CiTab } from "@/features/github/ui/ci/CiTab";
import { TrashTab } from "@/features/trash/ui/TrashTab";
import { NoteTab } from "@/features/notes/ui/NoteTab";
import { ChatsTab } from "@/features/chatPanel/ui/board/ChatsTab";
import { useChatPlacement } from "./chatPlacement";
import { useGitStatus } from "@/features/git/ui/useGitStatus";
import { ProjectEditDialog } from "@/features/projects/ui/settings/ProjectEditDialog";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectTabs, useProjectTabsLayout } from "./ProjectTabs";
import { useProjectData } from "./useProjectData";
import { useBusyBadge } from "@/foundation/ui/hooks/useBusyBadge";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { MissingProject, NoProjectsWelcome } from "@/features/projects/ui/ProjectsEmpty";
import type { FileTarget, ProjectViewId, ReopenRoute } from "@/foundation/ui/navigation/router";
import { storage } from "@/features/projects/ui/storage";
import { WorktreeContext } from "@/foundation/ui/workplace/worktreeContext";
import { WindowHeaderContent } from "@/foundation/ui/shell/WindowHeaderContent";

interface ProjectPageProps {
  id: number;
  tab: ProjectViewId;
  /** カンバンの右側のパネルで開くチャット・新しいチャット（サイドバー・検索などから開いたとき） */
  focus?: ReopenRoute;
  /** ファイルタブで開くファイル（チャットの返答のファイルのチップから） */
  openFile?: FileTarget;
  /** ノートのタブで開くノート（チャットの「ノートに追加」から） */
  openNote?: string;
  /** そのノートで移る行（⌘K の「ノート内の文言」から） */
  openNoteLine?: number;
}

/**
 * プロジェクト画面: ボード（カンバン）・チャット（ボードと分ける置き方のとき）・ファイル・検索・変更（Git の変更とファイル。文書もここでファイルとして見る）・
 * 履歴（コミット）・ノートをタブで
 */
export function ProjectPage(props: ProjectPageProps) {
  // 一覧が届いたのに見つからないプロジェクト（消した・URL の番号が違う）は、前の画面を出さずに案内だけを出す
  // （中身の部品を出さないので、そのプロジェクトのグループ・Git の状態を読みに行かない）。プロジェクトが 1 つもなければ始め方の案内
  const { missing, projects } = useProjects();
  if (missing(props.id))
    return <div className="page page-wide">{projects.length === 0 ? <NoProjectsWelcome /> : <MissingProject id={props.id} />}</div>;
  return <ProjectPageBody {...props} />;
}

function ProjectPageBody({ id, tab: routeTab, focus, openFile, openNote, openNoteLine }: ProjectPageProps) {
  // チャットをボードの右で開く置き方では「チャット」タブはないので、そのタブの URL はボードで出す
  const [placement] = useChatPlacement();
  // DB・GitHub・Docker のタブはこの Mac のアプリの中だけ（ブラウザ・スマホから開いたらボード）
  const macOnly = routeTab === "db" || routeTab === "github" || routeTab === "docker" || routeTab === "ci";
  const tab: ProjectViewId = (routeTab === "chats" && placement === "together") || (macOnly && !window.kickoff) ? "board" : routeTab;
  const { data: shown, error, loading: chatsLoading } = useProjectData(id);
  const [editing, setEditing] = useState(false);
  // ファイル・検索・変更・履歴タブで見る作業場所（ワークツリーのフォルダ。空なら本体。プロジェクトごとに覚える）
  const [storedWorktree, storeWorktree] = useSetting(storage.settings.workplace(id));
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
  const followOpenFile = useEffectEvent(() => {
    if (openFile && openFile.worktree !== worktree) setWorktree(openFile.worktree);
  });
  useEffect(() => {
    followOpenFile();
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
      {/* ノート（プロジェクトの外のフォルダ。作業場所には関係しない）。別のプロジェクトを読み込んでいる途中は、URL で来たノートを渡さない */}
      {tab === "notes" && <NoteTab key={project.id} projectId={project.id} openNote={stale ? undefined : openNote} openNoteLine={openNoteLine} />}
      {/* DB クライアント（SQLite のファイルは、ファイル・検索・変更・履歴のタブで選んだ作業場所の中を開く） */}
      {tab === "db" && <LazyDatabaseClient key={project.id} projectId={project.id} place={`project-${project.id}`} worktree={worktree ?? null} />}
      {/* GitHub（連携先のリポジトリの issue・PR を読む） */}
      {tab === "github" && <GitHubTab key={project.id} projectId={project.id} />}
      {/* Docker（本体とワークツリーの compose のサービス） */}
      {tab === "docker" && <DockerTab key={project.id} projectId={project.id} />}
      {/* CI（GitHub Actions の実行の一覧・ログ・やり直し） */}
      {tab === "ci" && <CiTab key={project.id} projectId={project.id} />}
      {/* ゴミ箱（消したものを 3 日取っておき、元に戻せる） */}
      {tab === "trash" && <TrashTab key={project.id} projectId={project.id} />}
      </div>
      </div>
      {/* 最大表示で元の画面が隠れていても、見出しから開いた設定は操作できる位置へ出す */}
      {editing && <WindowHeaderContent><ProjectEditDialog project={project} onClose={() => setEditing(false)} /></WindowHeaderContent>}
    </div>
  );
}
