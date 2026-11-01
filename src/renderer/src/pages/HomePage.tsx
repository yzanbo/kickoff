import { FolderGit2, Plus } from "lucide-react";
import type { Approval, ProjectSummary } from "../../../core/types";
import { api, useAsync } from "../api";
import { KanbanBoard } from "../components/board/KanbanBoard";
import { StatusCard } from "../components/StatusCard";

interface Props {
  projects: ProjectSummary[];
  approvals: Approval[];
  onNewProject: () => void;
}

/** ホーム: 全プロジェクトのチャットのカンバン */
export function HomePage({ projects, approvals, onNewProject }: Props) {
  const providers = useAsync(api.providers);
  const github = useAsync(api.github);
  const claude = providers.data?.find((p) => p.id === "claude");
  const notReady = (!providers.loading && !claude?.loggedIn) || (!github.loading && !github.data?.loggedIn);

  return (
    <div className="page page-wide page-board">
      {notReady && (
        <section className="section">
          <div className="status-grid">
            <StatusCard title="Claude Code" ok={providers.loading ? undefined : Boolean(claude?.loggedIn)} detail={providers.error ?? claude?.detail ?? "確認中…"} />
            <StatusCard title="GitHub CLI（gh）" ok={github.loading ? undefined : Boolean(github.data?.loggedIn)} detail={github.error ?? github.data?.detail ?? "確認中…"} />
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
        <KanbanBoard projects={projects} approvals={approvals} title="カンバン（全プロジェクト）" />
      )}
    </div>
  );
}
