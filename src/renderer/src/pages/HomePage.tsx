import { PHASE_LABELS, type ProjectSummary } from "../../../core/types";
import { api, useAsync } from "../api";
import { StatusCard } from "../components/StatusCard";
import { UsagePanel } from "../components/UsagePanel";
import { href } from "../router";
import type { usePlanUsage } from "../usage";

interface Props {
  planUsage: ReturnType<typeof usePlanUsage>;
  projects: ProjectSummary[];
  onNewProject: () => void;
}

export function HomePage({ planUsage, projects, onNewProject }: Props) {
  const providers = useAsync(api.providers);
  const github = useAsync(api.github);
  const claude = providers.data?.find((p) => p.id === "claude");

  return (
    <div className="page">
      <header className="page-header">
        <h1>ようこそ</h1>
        <p className="muted">アイデアからデプロイまで、AI と一緒に進めるための作業場です。</p>
      </header>

      <section className="section">
        <div className="section-head">
          <h2>プロジェクト</h2>
          <button className="btn btn-primary" onClick={onNewProject}>
            ＋ 新しいプロジェクト
          </button>
        </div>
        {projects.length === 0 ? (
          <div className="empty">まだプロジェクトがありません。アイデアから始めましょう。</div>
        ) : (
          <div className="project-cards">
            {projects.map((p) => (
              <a key={p.id} className="project-card" href={href({ name: "project", id: p.id })}>
                <div className="project-card-name">{p.name}</div>
                <div className="muted small">{PHASE_LABELS[p.current_phase]}</div>
              </a>
            ))}
          </div>
        )}
      </section>

      <UsagePanel planUsage={planUsage} />

      <section className="section">
        <h2>準備状況</h2>
        <div className="status-grid">
          <StatusCard
            title="Claude Code"
            ok={providers.loading ? undefined : Boolean(claude?.loggedIn)}
            detail={providers.error ?? claude?.detail ?? "確認中…"}
          />
          <StatusCard
            title="GitHub CLI（gh）"
            ok={github.loading ? undefined : Boolean(github.data?.loggedIn)}
            detail={github.error ?? github.data?.detail ?? "確認中…"}
          />
        </div>
        <p className="muted small">
          詳細は <a href={href({ name: "settings" })}>設定</a> で確認できます。
        </p>
      </section>

    </div>
  );
}
