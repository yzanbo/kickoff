import { ArchiveRestore, FolderOpen, Pencil } from "lucide-react";
import { useRunStates } from "../../approvalsContext";
import { confirmRestoreProject } from "../../projectOrder";
import { href, type ProjectTab } from "../../router";
import { BUSY_STATUSES } from "../RunStatus";
import { ProjectSwitcher } from "./ProjectSwitcher";
import type { ProjectData } from "./useProjectData";

const TAB_LABELS: Record<ProjectTab, string> = {
  board: "ボード",
  groups: "グループ",
  requirements: "要件定義書",
  schedule: "スケジュール",
  tasks: "タスク",
  reports: "レポート",
  changes: "エディタ",
};

/**
 * プロジェクト画面の見出し: 名前（プロジェクトの切り替え）・編集・しまったものを戻す・フォルダの場所・回答待ちと作業中の数と、
 * タブの列（タスク・チャット・グループの件数、エディタは変更のあるファイルの数 changeCount）
 */
export function ProjectHeader({ data, tab, changeCount, onEdit }: { data: ProjectData; tab: ProjectTab; changeCount: number; onEdit: () => void }) {
  const { project, tasks, runs, groups } = data;
  // 回答待ちの依頼（App が持ち、イベントで更新される）
  const { pending } = useRunStates();
  const waiting = runs.filter((r) => pending.has(r.id)).length;
  const working = runs.filter((r) => BUSY_STATUSES.includes(r.status)).length - waiting;
  return (
  <header className="page-header project-header">
    <div className="project-title-row">
      <h1>
        <ProjectSwitcher project={project} tab={tab} />
      </h1>
      <button className="btn btn-sm project-edit-button" title="プロジェクトの名前・既定の設定などを編集" onClick={onEdit}>
        <Pencil size={13} /> 編集
      </button>
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
        onClick={() => void window.kickoff?.openPath(project.repo_path)}
      >
        <FolderOpen size={13} aria-hidden />
        <span className="path-button-text">{project.repo_path}</span>
      </button>
      <div className="project-stats">
        {project.archived_at && <span className="stat stat-archived">アーカイブ済み</span>}
        {waiting > 0 && <span className="stat stat-waiting">回答待ち {waiting}</span>}
        {working > 0 && <span className="stat stat-working">作業中 {working}</span>}
      </div>
    </div>
    <div className="project-tabs-row">
    <nav className="tabs" role="tablist">
      {(Object.keys(TAB_LABELS) as ProjectTab[]).map((t) => (
        <a
          key={t}
          role="tab"
          aria-selected={tab === t}
          className={`tab ${tab === t ? "active" : ""}`}
          href={href({ name: "project", id: project.id, tab: t })}
        >
          {TAB_LABELS[t]}
          {t === "tasks" && tasks.length > 0 && <span className="tab-count">{tasks.length}</span>}
          {t === "board" && runs.length > 0 && <span className="tab-count">{runs.length}</span>}
          {t === "groups" && groups.length > 0 && <span className="tab-count">{groups.length}</span>}
          {t === "changes" && changeCount > 0 && (
            <span className="change-count" aria-label={`変更のあるファイル ${changeCount} 件`}>
              {changeCount}
            </span>
          )}
        </a>
      ))}
    </nav>
    </div>
  </header>
  );
}
