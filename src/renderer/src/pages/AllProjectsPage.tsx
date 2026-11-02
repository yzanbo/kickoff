import { FolderGit2, Plus } from "lucide-react";
import type { Approval, ProjectSummary } from "../../../core/types";
import { api, useAsync } from "../api";
import { ProjectSwitcher } from "../components/ProjectSwitcher";
import { GitHubStatusCard, StatusCard } from "../components/StatusCard";
import { KanbanBoard } from "../components/board/KanbanBoard";
import { PanelLayout } from "../components/sidePanel/SidePanel";
import { terminalTargets, useSidePanel } from "../components/sidePanel/useSidePanel";

interface Props {
  projects: ProjectSummary[];
  approvals: Approval[];
  onNewProject: () => void;
}

/** 全プロジェクト: 全プロジェクトのチャットのカンバン（見出しはプロジェクトの画面と同じ形。名前から各プロジェクトへ切り替えられる） */
export function AllProjectsPage({ projects, approvals, onNewProject }: Props) {
  const providers = useAsync(api.providers);
  const github = useAsync(api.github);
  const claude = providers.data?.find((p) => p.id === "claude");
  const notReady = (!providers.loading && !claude?.loggedIn) || (!github.loading && !github.data?.loggedIn);
  // 右のパネル（全プロジェクトの画面だけのもの。新しいチャットはプロジェクトを選んで始める）
  const panel = useSidePanel({ memoryKey: "kanban:all", projects });
  // 回答待ち・作業中の数（プロジェクトの画面と同じ数え方で、全プロジェクトの分）
  const waiting = new Set(approvals.map((a) => a.run_id)).size;
  const working = projects.reduce((n, p) => n + p.active_runs, 0) - waiting;

  return (
    <div className="page page-wide page-board">
      <header className="page-header project-header">
        <div className="project-title-row">
          <h1>
            <ProjectSwitcher projects={projects} />
          </h1>
          <div className="project-stats">
            {waiting > 0 && <span className="stat stat-waiting">回答待ち {waiting}</span>}
            {working > 0 && <span className="stat stat-working">作業中 {working}</span>}
          </div>
        </div>
      </header>
      {notReady && (
        <section className="section">
          <div className="card-grid">
            <StatusCard title="Claude Code" ok={providers.loading ? undefined : Boolean(claude?.loggedIn)} detail={providers.error ?? claude?.detail ?? "確認中…"} />
            <GitHubStatusCard github={github} />
          </div>
        </section>
      )}
      {projects.length === 0 ? (
        <div className="empty empty-hero">
          <FolderGit2 size={28} />
          <p>アイデアから始めましょう。新しいフォルダを作るか、既存のフォルダを取り込めます。</p>
          <button className="btn btn-primary" onClick={onNewProject}>
            <Plus size={15} /> 新しいプロジェクト
          </button>
        </div>
      ) : (
        <PanelLayout panel={panel} onNewChat={() => projects[0] && panel.openNew({ projectId: projects[0].id })} terminals={terminalTargets(projects)}>
          <KanbanBoard projects={projects} approvals={approvals} title="カンバン" panel={panel} />
        </PanelLayout>
      )}
    </div>
  );
}
