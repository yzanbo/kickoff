import { useState } from "react";
import { EditorTab } from "@/features/files/ui/EditorTab";
import { HistoryTab } from "@/features/git/ui/history/HistoryTab";
import { WorkplaceProvider } from "@/foundation/ui/workplace/workplaceContext";
import { useProjects } from "@/features/projects/ui/stores/projects";
import type { ProjectView } from "@/features/panel/ui/tabs/panelTypes";

/**
 * 右の欄の、プロジェクトの「ファイル」「検索」「履歴」タブと同じ画面（中身はプロジェクトのタブの部品そのまま: EditorTab / HistoryTab）。
 * 見る作業場所はチャットの作業場所から始め、上の作業場所の切り替えで変えられる（このタブの中だけ。プロジェクトのタブの作業場所は変えない）
 */
export function SideProjectView({ chatId, projectId, worktree: initial, view }: { chatId: number; projectId: number; worktree?: string; view: ProjectView }) {
  const [worktree, setWorktree] = useState(initial);
  const project = useProjects().projectsById.get(projectId);
  if (!project) return <p className="muted small">読み込み中…</p>;
  return (
    <div className="project-content side-project-view">
      <WorkplaceProvider value={{ projectId, worktree: worktree ?? null }}>
        {view === "history" ? (
          <HistoryTab key={worktree ?? ""} projectId={projectId} worktree={worktree} onWorktreeChange={setWorktree} />
        ) : (
          // 開いたファイルのタブは、プロジェクトのタブとは別に、チャットとタブの種類ごとに覚える
          <EditorTab
            key={worktree ?? ""}
            view={view}
            projectId={projectId}
            repoPath={project.repo_path}
           
            worktree={worktree}
            onWorktreeChange={setWorktree}
            panelScope={`view-${chatId}-${view}`}
          />
        )}
      </WorkplaceProvider>
    </div>
  );
}
