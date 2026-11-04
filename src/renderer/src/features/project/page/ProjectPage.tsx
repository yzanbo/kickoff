import { useEffect, useState } from "react";
import { useBoardColumns } from "@/features/board/BoardColumnsToggle";
import { GroupBoard } from "@/features/board/GroupBoard";
import { KanbanBoard } from "@/features/board/KanbanBoard";
import { ChangesTab } from "@/features/editor/EditorTab";
import { HistoryTab } from "@/features/history/HistoryTab";
import { useGitStatus } from "@/features/editor/useGitStatus";
import { ProjectEditDialog } from "@/features/project/settings/ProjectEditDialog";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectTabs, useProjectTabsLayout } from "./ProjectTabs";
import { useProjectData } from "./useProjectData";
import { useBusyBadge } from "@/hooks/useBusyBadge";
import { useStoredState } from "@/hooks/useStoredState";
import type { FileTarget, ProjectTab, ReopenRoute } from "@/app/router";
import { editorWorktreeKey } from "@/lib/storageKeys";
import { WorktreeContext } from "@/features/worktree/worktreeContext";

/** プロジェクト画面: ボード（カンバン）・グループ・エディタ（Git の変更とファイル。文書もここでファイルとして見る）・履歴（コミット）をタブで */
export function ProjectPage({
  id,
  tab,
  focus,
  highlightGroup,
  openFile,
}: {
  id: number;
  tab: ProjectTab;
  /** カンバンの右側のパネルで開くチャット・新しいチャット（サイドバー・検索などから開いたとき） */
  focus?: ReopenRoute;
  /** グループのタブで目立たせるグループ（サイドバーのグループ名から来たとき） */
  highlightGroup?: number;
  /** エディタタブで開くファイル（チャットの返答のファイルのチップから） */
  openFile?: FileTarget;
}) {
  const { data: shown, error, loading: runsLoading } = useProjectData(id);
  const [editing, setEditing] = useState(false);
  // ボードの列の分け方は、最後に見た方を覚える（サイドバーのグループから来たときも、次にボードのタブを押すとグループの列で開く）
  const [, setColumns] = useBoardColumns();
  useEffect(() => {
    if (tab === "board") setColumns("state");
    else if (tab === "groups") setColumns("groups");
  }, [tab, setColumns]);
  // エディタ・履歴タブで見る作業場所（ワークツリーのフォルダ。空なら本体。プロジェクトごとに覚える）
  const [worktree, setWorktree] = useStoredState<string | undefined>(editorWorktreeKey(id), (raw) => raw || undefined, (v) => v ?? "");
  // Git の変更（タブのバッジに数を出し、エディタタブで一覧と差分を出す）
  const git = useGitStatus(id, tab === "changes" || tab === "history", worktree);
  // タブの数を取り直している最中（更新を知ってから結果が届くまで、数の代わりに更新中の印を出す）
  const refreshing = { runs: useBusyBadge(runsLoading), changes: useBusyBadge(git.refreshing) };
  // タブの置き方（見出しの下に横並び / 左に縦並び。設定の「表示」）
  const [tabsLayout] = useProjectTabsLayout();
  // 開くファイルが別の作業場所のものなら、先にその作業場所へ切り替える（切り替わってから ChangesTab に渡す）
  useEffect(() => {
    if (openFile && openFile.worktree !== worktree) setWorktree(openFile.worktree);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFile]);

  if (error && !shown) return <div className="page error">{error}</div>;
  if (!shown) return <div className="page muted">読み込み中…</div>;
  const { project, groups } = shown;
  // 別のプロジェクトを読み込んでいる途中（前の画面を薄くして出しておく）
  const stale = project.id !== id;

  return (
    <div className={`page page-wide page-board ${stale ? "is-stale" : ""}`}>
      <ProjectHeader data={shown} tab={tab} changeCount={git.count} refreshing={refreshing} onEdit={() => setEditing(true)} />
      {/* タブを左に縦並びにする設定のときは、本体の左にアイコンだけで並べる（見出しの下の行がなくなり、本体の縦の幅が増える） */}
      <div className="project-main">
      {tabsLayout === "side" && <ProjectTabs projectId={project.id} tab={tab} runs={shown.runs} changeCount={git.count} refreshing={refreshing} vertical />}
      <div className="project-content">

      {tab === "board" && <KanbanBoard projectId={project.id} focus={focus} groups={groups} />}
      {tab === "groups" && <GroupBoard projectId={project.id} groups={groups} focus={focus} highlight={highlightGroup} />}
      {tab === "changes" && (
        <WorktreeContext.Provider value={worktree}>
          {/* 作業場所を変えたら、選んでいたファイル・検索などは初めからにする */}
          <ChangesTab
            key={worktree ?? ""}
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
      </div>
      </div>
      {editing && <ProjectEditDialog project={project} onClose={() => setEditing(false)} />}
    </div>
  );
}
