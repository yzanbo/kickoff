import { FolderGit2, Plus, Tags } from "lucide-react";
import { api } from "../api";
import { useAsync } from "../hooks/useAsync";
import { ProjectSwitcher } from "../components/project/ProjectSwitcher";
import { GitHubStatusCard, StatusCard } from "../components/StatusCard";
import { KanbanBoard } from "../components/board/KanbanBoard";
import { sidebarOrder } from "../projectOrder";
import { useProjects } from "../projectsContext";
import { tagLabel, useProjectTagFilter } from "../projectTagFilter";
import { TagFilterNotice } from "../components/TagFilterNotice";
import { useBoardRuns } from "../components/board/useBoardRuns";
import { StateStats } from "../components/project/StateStats";

interface Props {
  onNewProject: () => void;
}

/** 全プロジェクト: 全プロジェクトのチャットのカンバン（見出しはプロジェクトの画面と同じ形。名前から各プロジェクトへ切り替えられる） */
export function AllProjectsPage({ onNewProject }: Props) {
  const { projects } = useProjects();
  const providers = useAsync(api.providers);
  const github = useAsync(api.github);
  const claude = providers.data?.find((p) => p.id === "claude");
  // しまった（アーカイブした）プロジェクトは、全プロジェクトの画面に出さない。サイドバーの「タグ」で絞り込んでいれば、合うものだけ
  const tagFilter = useProjectTagFilter();
  const all = sidebarOrder(projects);
  const shown = all.filter(tagFilter.matches);
  const notReady = (!providers.loading && !claude?.loggedIn) || (!github.loading && !github.data?.loggedIn);
  // 状態ごとの数: すぐ下の全プロジェクトのカンバンと同じチャット（しまったプロジェクトの分は除く）を、プロジェクトの画面・サイドバーと同じ数え方で
  const { runs } = useBoardRuns(undefined, false, () => {});
  const shownRuns = runs.filter((r) => shown.some((p) => p.id === r.project_id));

  return (
    <div className="page page-wide page-board">
      <header className="page-header project-header">
        <div className="project-title-row">
          <h1>
            <ProjectSwitcher />
          </h1>
          <TagFilterNotice filter={tagFilter} />
          <div className="project-stats">
            <StateStats runs={shownRuns} showProject />
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
      {shown.length === 0 && all.length > 0 ? (
        // タグで絞り込んで、合うプロジェクトがないとき
        <div className="empty empty-hero">
          <Tags size={28} />
          <p>タグ「{tagFilter.selected.map(tagLabel).join("、")}」に合うプロジェクトはありません。</p>
          <button className="btn" onClick={tagFilter.clear}>
            絞り込みを外す
          </button>
        </div>
      ) : shown.length === 0 ? (
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
