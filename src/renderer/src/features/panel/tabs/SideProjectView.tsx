import { useState } from "react";
import { EditorTab } from "@/features/editor/EditorTab";
import { useGitStatus } from "@/features/editor/useGitStatus";
import { HistoryTab } from "@/features/history/HistoryTab";
import { WorktreeContext } from "@/features/worktree/worktreeContext";
import { useProjects } from "@/stores/projects";
import type { ProjectView } from "./panelTypes";

/**
 * 右の欄の、プロジェクトの「ファイル」「検索」「履歴」タブと同じ画面（中身はプロジェクトのタブの部品そのまま: EditorTab / HistoryTab）。
 * 見る作業場所はチャットの作業場所から始め、上の作業場所の切り替えで変えられる（このタブの中だけ。プロジェクトのタブの作業場所は変えない）
 */
export function SideProjectView({ projectId, worktree: initial, view }: { projectId: number; worktree?: string; view: ProjectView }) {
  const [worktree, setWorktree] = useState(initial);
  const project = useProjects().projectsById.get(projectId);
  const git = useGitStatus(projectId, true, worktree);
  if (!project) return <p className="muted small">読み込み中…</p>;
  return (
    <div className="project-content side-project-view">
      <WorktreeContext.Provider value={worktree}>
        {view === "history" ? (
          <HistoryTab key={worktree ?? ""} projectId={projectId} git={git} worktree={worktree} onWorktreeChange={setWorktree} />
        ) : (
          <EditorTab key={worktree ?? ""} view={view} projectId={projectId} repoPath={project.repo_path} git={git} worktree={worktree} onWorktreeChange={setWorktree} />
        )}
      </WorktreeContext.Provider>
    </div>
  );
}
