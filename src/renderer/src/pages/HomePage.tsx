import { FolderGit2, Plus } from "lucide-react";
import type { Approval, ProjectSummary } from "../../../core/types";
import { api, useAsync } from "../api";
import { StatusCard } from "../components/StatusCard";
import { UsagePanel } from "../components/UsagePanel";
import { href } from "../router";
import type { usePlanUsage } from "../usage";

interface Props {
  planUsage: ReturnType<typeof usePlanUsage>;
  projects: ProjectSummary[];
  approvals: Approval[];
  onNewProject: () => void;
}

/** ホーム: プロジェクト一覧・使用状況・準備状況 */
export function HomePage({ planUsage, projects, approvals, onNewProject }: Props) {
  const providers = useAsync(api.providers);
  const github = useAsync(api.github);
  const claude = providers.data?.find((p) => p.id === "claude");
  const notReady = (!providers.loading && !claude?.loggedIn) || (!github.loading && !github.data?.loggedIn);

  return (
    <div className="page page-wide">
      <header className="page-header home-header">
        <h1>プロジェクト</h1>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={onNewProject}>
          <Plus size={15} /> 新しいプロジェクト
        </button>
      </header>

      {projects.length === 0 ? (
        <div className="empty empty-hero">
          <FolderGit2 size={28} />
          <p>アイデアから始めましょう。新しいフォルダを作るか、既存のフォルダを取り込めます。</p>
          <button className="btn btn-primary" onClick={onNewProject}>
            <Plus size={15} /> 新しいプロジェクト
          </button>
        </div>
      ) : (
        <div className="project-cards">
          {projects.map((p) => {
            const waiting = approvals.filter((a) => a.project_id === p.id).length;
            const tasks = Object.values(p.task_counts).reduce((a, b) => a + b, 0);
            return (
              <a key={p.id} className="project-card" href={href({ name: "project", id: p.id, tab: "chats" })}>
                <div className="project-card-name">{p.name}</div>
                <div className="project-card-desc muted small">{p.description.split("\n")[0] || p.repo_path}</div>
                <div className="project-card-stats small">
                  {waiting > 0 && <span className="stat stat-waiting">回答待ち {waiting}</span>}
                  {p.active_runs - waiting > 0 && <span className="stat stat-working">作業中 {p.active_runs - waiting}</span>}
                  <span className="muted">
                    タスク {p.task_counts.done}/{tasks}
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}

      <UsagePanel planUsage={planUsage} />

      {notReady && (
        <section className="section">
          <h2>準備が必要です</h2>
          <div className="status-grid">
            <StatusCard title="Claude Code" ok={providers.loading ? undefined : Boolean(claude?.loggedIn)} detail={providers.error ?? claude?.detail ?? "確認中…"} />
            <StatusCard title="GitHub CLI（gh）" ok={github.loading ? undefined : Boolean(github.data?.loggedIn)} detail={github.error ?? github.data?.detail ?? "確認中…"} />
          </div>
        </section>
      )}
    </div>
  );
}
