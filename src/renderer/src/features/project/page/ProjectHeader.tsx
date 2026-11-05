import { ArchiveRestore, FolderOpen, Settings } from "lucide-react";
import { IconButton } from "@/ui/IconButton";
import { confirmRestoreProject } from "@/features/project/projectOrder";
import type { ProjectTab } from "@/app/router";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { ProjectTabs, useProjectTabsLayout, type TabRefreshing } from "./ProjectTabs";
import { StateStats } from "./StateStats";
import type { ProjectData } from "./useProjectData";

/**
 * プロジェクト画面の見出し: 名前（プロジェクトの切り替え）・設定の歯車・しまったものを戻す・フォルダの場所・状態ごとのチャット数と、
 * タブの列（チャットの件数、変更は変更のあるファイルの数 changeCount。左に縦並びにする設定のときは、見出しには出さない）
 */
export function ProjectHeader({
  data,
  tab,
  changeCount,
  refreshing,
  onEdit,
}: {
  data: ProjectData;
  tab: ProjectTab;
  changeCount: number;
  refreshing: TabRefreshing;
  onEdit: () => void;
}) {
  const { project, chats } = data;
  const [layout] = useProjectTabsLayout();
  return (
  <header className="page-header project-header">
    <div className="project-title-row">
      <h1>
        <ProjectSwitcher project={project} tab={tab} />
      </h1>
      {/* プロジェクトの設定（名前・既定の設定などの編集）。左下のアプリの設定と同じ歯車 */}
      <IconButton icon={Settings} label="プロジェクトの設定" title="プロジェクトの設定（名前・既定の設定などを編集）" className="project-edit-button" onClick={onEdit} />
      {/* しまった（アーカイブした）プロジェクト: サイドバーに出ないので、ここから戻せるようにする */}
      {project.archived_at && (
        <button
          className="btn btn-sm"
          title="アーカイブから戻す（サイドバー・全プロジェクトの画面に出す）"
          onClick={() => void confirmRestoreProject(project)}
        >
          <ArchiveRestore size={13} /> 戻す
        </button>
      )}
      {/* フォルダの場所（名前の横に並べ、見出しを 1 行に収める） */}
      <button
        className="path-button"
        disabled={!window.kickoff}
        title={window.kickoff ? `Finder で開く（${project.repo_path}）` : project.repo_path}
        onClick={() => void window.kickoff?.externalApps.openPath(project.repo_path)}
      >
        <FolderOpen size={13} aria-hidden />
        <span className="path-button-text">{project.repo_path}</span>
      </button>
      <div className="project-stats">
        {project.archived_at && <span className="stat stat-archived">アーカイブ済み</span>}
        <StateStats chats={chats} />
      </div>
    </div>
    {layout === "top" && (
      <div className="project-tabs-row">
        <ProjectTabs projectId={project.id} tab={tab} chats={chats} changeCount={changeCount} refreshing={refreshing} />
      </div>
    )}
  </header>
  );
}
