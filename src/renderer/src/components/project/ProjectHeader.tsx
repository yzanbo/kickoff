import { ArchiveRestore, FolderOpen, Pencil } from "lucide-react";
import { confirmRestoreProject } from "../../projectOrder";
import { href, type ProjectTab } from "../../router";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { StateStats } from "./StateStats";
import { useBoardColumns } from "../board/BoardColumnsToggle";
import type { ProjectData } from "./useProjectData";

/** タブの列に出すタブ（グループは「ボード」の中の列の切り替えにまとめたので出さない） */
const TAB_LABELS: Partial<Record<ProjectTab, string>> = {
  board: "ボード",
  changes: "エディタ",
};

/**
 * プロジェクト画面の見出し: 名前（プロジェクトの切り替え）・編集・しまったものを戻す・フォルダの場所・状態ごとのチャット数と、
 * タブの列（チャット・グループの件数、エディタは変更のあるファイルの数 changeCount）
 */
export function ProjectHeader({ data, tab, changeCount, onEdit }: { data: ProjectData; tab: ProjectTab; changeCount: number; onEdit: () => void }) {
  const { project, runs } = data;
  const [columns] = useBoardColumns();
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
        <StateStats runs={runs} />
      </div>
    </div>
    <div className="project-tabs-row">
    <nav className="tabs" role="tablist">
      {(Object.keys(TAB_LABELS) as ProjectTab[]).map((t) => {
        // ボードのタブは、列が状態でもグループでも選んだ状態にし、押したら最後に見た列の分け方で開く
        const selected = tab === t || (t === "board" && tab === "groups");
        const target: ProjectTab = t === "board" && columns === "groups" ? "groups" : t;
        return (
        <a
          key={t}
          role="tab"
          aria-selected={selected}
          className={`tab ${selected ? "active" : ""}`}
          href={href({ name: "project", id: project.id, tab: target })}
        >
          {TAB_LABELS[t]}
          {t === "board" && runs.length > 0 && <span className="tab-count">{runs.length}</span>}
          {t === "changes" && changeCount > 0 && (
            <span className="change-count" aria-label={`変更のあるファイル ${changeCount} 件`}>
              {changeCount}
            </span>
          )}
        </a>
        );
      })}
    </nav>
    </div>
  </header>
  );
}
