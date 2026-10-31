import { PHASE_LABELS, type Project } from "../../../core/types";
import { api, useAsync } from "../api";
import { PhaseStepper } from "../components/PhaseStepper";
import { navigate } from "../router";

export function ProjectPage({ id, version }: { id: number; version: number }) {
  // version はサーバーからプロジェクト更新の通知が来るたびに増え、再取得のきっかけになる
  const { data: project, error, loading } = useAsync(() => api.project(id), [id, version]);

  if (loading && !project) return <div className="page muted">読み込み中…</div>;
  if (error || !project) return <div className="page error">{error ?? "プロジェクトが見つかりません"}</div>;

  return (
    <div className="page">
      <header className="page-header">
        <h1>{project.name}</h1>
        <p className="muted small path-line">
          {window.kickoff ? (
            <button className="link-button" onClick={() => void window.kickoff?.openPath(project.repo_path)}>
              {project.repo_path}
            </button>
          ) : (
            project.repo_path
          )}
        </p>
      </header>

      <PhaseStepper current={project.current_phase} />

      <section className="next-card">
        <div className="next-label">次にやること</div>
        <NextAction project={project} />
      </section>

      <section className="section">
        <h2>アイデア</h2>
        {project.description.trim() ? (
          <p className="prewrap">{project.description}</p>
        ) : (
          <p className="muted">まだ書かれていません。</p>
        )}
      </section>

      <section className="section danger-zone">
        <button
          className="btn"
          onClick={async () => {
            if (!confirm(`「${project.name}」を Kickoff から外しますか？\nフォルダとリポジトリは削除されません。`)) return;
            await api.deleteProject(project.id);
            navigate({ name: "home" });
          }}
        >
          Kickoff から外す
        </button>
      </section>
    </div>
  );
}

function NextAction({ project }: { project: Project }) {
  switch (project.current_phase) {
    case "requirements":
      return (
        <>
          <div className="next-title">要件定義を始めましょう</div>
          <p className="muted">
            AI と壁打ちしながら要件を詰め、要件定義書とタスクを作ります（この機能は M1 の続きで実装します）。
          </p>
        </>
      );
    default:
      return <div className="next-title">{PHASE_LABELS[project.current_phase]}フェーズ</div>;
  }
}
