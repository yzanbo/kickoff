import { useState } from "react";
import { PHASES } from "../../../core/types";
import { GroupBoard } from "../components/board/GroupBoard";
import { KanbanBoard } from "../components/board/KanbanBoard";
import { ChangesTab } from "../components/changes/ChangesTab";
import { useGitStatus } from "../components/changes/useGitStatus";
import { DocTab } from "../components/project/DocTab";
import { ProjectEditDialog } from "../components/project/ProjectEditDialog";
import { ProjectHeader } from "../components/project/ProjectHeader";
import { ReportsTab } from "../components/project/ReportsTab";
import { TaskList } from "../components/project/TaskList";
import { useProjectData } from "../components/project/useProjectData";
import { useStoredState } from "../hooks/useStoredState";
import type { ProjectTab, ReopenRoute } from "../router";
import { editorWorktreeKey } from "../storageKeys";
import { WorktreeContext } from "../worktree/worktreeContext";

/** プロジェクト画面: チャット一覧と、決まったこと（要件定義書・スケジュール・タスク・レポート）をタブで */
export function ProjectPage({
  id,
  tab,
  focus,
  highlightGroup,
}: {
  id: number;
  tab: ProjectTab;
  /** カンバンの右側のパネルで開くチャット・新しいチャット（サイドバー・検索などから開いたとき） */
  focus?: ReopenRoute;
  /** グループのタブで目立たせるグループ（サイドバーのグループ名から来たとき） */
  highlightGroup?: number;
}) {
  const { data: shown, error } = useProjectData(id);
  const [editing, setEditing] = useState(false);
  // エディタタブで見る作業場所（ワークツリーのフォルダ。空なら本体。プロジェクトごとに覚える）
  const [worktree, setWorktree] = useStoredState<string | undefined>(editorWorktreeKey(id), (raw) => raw || undefined, (v) => v ?? "");
  // Git の変更（タブのバッジに数を出し、エディタタブで一覧と差分を出す）
  const git = useGitStatus(id, tab === "changes", worktree);

  if (error && !shown) return <div className="page error">{error}</div>;
  if (!shown) return <div className="page muted">読み込み中…</div>;
  const { project, tasks, artifacts, runs, groups } = shown;
  // 別のプロジェクトを読み込んでいる途中（前の画面を薄くして出しておく）
  const stale = project.id !== id;

  return (
    <div className={`page page-wide ${tab === "board" || tab === "groups" || tab === "changes" ? "page-board" : ""} ${stale ? "is-stale" : ""}`}>
      <ProjectHeader data={shown} tab={tab} changeCount={git.count} onEdit={() => setEditing(true)} />

      {tab === "board" && <KanbanBoard projectId={project.id} focus={focus} groups={groups} />}
      {tab === "groups" && <GroupBoard projectId={project.id} runs={runs} groups={groups} focus={focus} highlight={highlightGroup} />}
      {tab === "requirements" && <DocTab project={project} kind="requirements" artifacts={artifacts} />}
      {tab === "schedule" && <DocTab project={project} kind="schedule" artifacts={artifacts} />}
      {tab === "tasks" && (
        <section className="section">
          <TaskList projectId={project.id} tasks={tasks} phases={PHASES.filter((p) => p !== "schedule")} />
        </section>
      )}
      {tab === "reports" && <ReportsTab artifacts={artifacts} />}
      {tab === "changes" && (
        <WorktreeContext.Provider value={worktree}>
          {/* 作業場所を変えたら、選んでいたファイル・検索などは初めからにする */}
          <ChangesTab key={worktree ?? ""} projectId={project.id} repoPath={project.repo_path} git={git} worktree={worktree} onWorktreeChange={setWorktree} />
        </WorktreeContext.Provider>
      )}
      {editing && <ProjectEditDialog project={project} onClose={() => setEditing(false)} />}
    </div>
  );
}
