import { FolderGit2, Plus } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks/useAsync";
import { ProjectSwitcher } from "../components/project/ProjectSwitcher";
import { GitHubStatusCard, StatusCard } from "../components/StatusCard";
import { KanbanBoard } from "../components/board/KanbanBoard";
import { sidebarOrder } from "../projectOrder";
import { useProjects } from "../projectsContext";
import { useRunStates } from "../approvalsContext";
import { useBoardRuns } from "../components/board/useBoardRuns";
import { StateStats } from "../components/project/StateStats";
import { stateCounts } from "../runState";

interface Props {
  onNewProject: () => void;
}

/** 全プロジェクト: 全プロジェクトのチャットのカンバン（見出しはプロジェクトの画面と同じ形。名前から各プロジェクトへ切り替えられる） */
export function AllProjectsPage({ onNewProject }: Props) {
  const { projects } = useProjects();
  const { pending } = useRunStates();
  const providers = useAsync(api.providers);
  const github = useAsync(api.github);
  const claude = providers.data?.find((p) => p.id === "claude");
  // しまった（アーカイブした）プロジェクトは、全プロジェクトの画面に出さない
  const shown = sidebarOrder(projects);
  const notReady = (!providers.loading && !claude?.loggedIn) || (!github.loading && !github.data?.loggedIn);
  // 状態ごとの数: すぐ下の全プロジェクトのカンバンと同じチャット（しまったプロジェクトの分は除く）を、プロジェクトの画面・サイドバーと同じ数え方で
  const { runs } = useBoardRuns(undefined, false, () => {});
  const counts = stateCounts(
    runs.filter((r) => shown.some((p) => p.id === r.project_id)),
    pending,
  );

  return (
    <div className="page page-wide page-board">
      <header className="page-header project-header">
        <div className="project-title-row">
          <h1>
            <ProjectSwitcher />
          </h1>
          <div className="project-stats">
            <StateStats counts={counts} />
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
