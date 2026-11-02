import { FolderGit2, Plus } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks/useAsync";
import { ProjectSwitcher } from "../components/project/ProjectSwitcher";
import { GitHubStatusCard, StatusCard } from "../components/StatusCard";
import { KanbanBoard } from "../components/board/KanbanBoard";
import { sidebarOrder } from "../projectOrder";
import { useProjects } from "../projectsContext";
import { useRunStates } from "../approvalsContext";

interface Props {
  onNewProject: () => void;
}

/** 全プロジェクト: 全プロジェクトのチャットのカンバン（見出しはプロジェクトの画面と同じ形。名前から各プロジェクトへ切り替えられる） */
export function AllProjectsPage({ onNewProject }: Props) {
  const { projects } = useProjects();
  const { approvals } = useRunStates();
  const providers = useAsync(api.providers);
  const github = useAsync(api.github);
  const claude = providers.data?.find((p) => p.id === "claude");
  // しまった（アーカイブした）プロジェクトは、全プロジェクトの画面に出さない
  const shown = sidebarOrder(projects);
  const notReady = (!providers.loading && !claude?.loggedIn) || (!github.loading && !github.data?.loggedIn);
  // 回答待ち・作業中の数（プロジェクトの画面と同じ数え方で、全プロジェクトの分）
  const shownApprovals = approvals.filter((a) => shown.some((p) => p.id === a.project_id));
  const waiting = new Set(shownApprovals.map((a) => a.run_id)).size;
  const working = shown.reduce((n, p) => n + p.active_runs, 0) - waiting;

  return (
    <div className="page page-wide page-board">
      <header className="page-header project-header">
        <div className="project-title-row">
          <h1>
            <ProjectSwitcher />
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
      {shown.length === 0 ? (
        <div className="empty empty-hero">
          <FolderGit2 size={28} />
          <p>アイデアから始めましょう。新しいフォルダを作るか、既存のフォルダを取り込めます。</p>
          <button className="btn btn-primary" onClick={onNewProject}>
            <Plus size={15} /> 新しいプロジェクト
          </button>
        </div>
      ) : (
        <KanbanBoard title="カンバン" />
      )}
    </div>
  );
}
