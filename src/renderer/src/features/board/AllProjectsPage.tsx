import { Tag } from "lucide-react";
import { ProjectSwitcher } from "@/features/project/page/ProjectSwitcher";
import { GitHubStatusCard, StatusCard } from "@/ui/StatusCard";
import { AllProjectsKanban } from "./KanbanBoard";
import { tagLabel } from "@/features/project/projectTagFilter";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
import { TagFilterNotice } from "@/features/project/TagFilterNotice";
import { useChats } from "@/stores/chats";
import { useGitHubStatus, useProviders } from "@/stores/providers";
import { StateStats } from "@/features/project/page/StateStats";
import { NoProjectsWelcome } from "@/features/project/ProjectsEmpty";
import { EmptyState } from "@/ui/EmptyState";

/**
 * 全プロジェクト: 全プロジェクトのチャットのカンバン（見出しはプロジェクトの画面と同じ形。名前から各プロジェクトへ切り替えられる）。
 * ここではチャットを開かず、カードを押すとそのプロジェクトへ移って開く（AllProjectsKanban）
 */
export function AllProjectsPage() {
  const providers = useProviders();
  const github = useGitHubStatus();
  const claude = providers.data?.find((p) => p.id === "claude");
  // しまった（アーカイブした）プロジェクトは、全プロジェクトの画面に出さない。サイドバーの「タグ」で絞り込んでいれば、合うものだけ
  const { active: all, visible: shown, archived, tagFilter } = useVisibleProjects();
  const notReady = (!providers.loading && !claude?.logged_in) || (!github.loading && !github.data?.logged_in);
  // 状態ごとの数: すぐ下の全プロジェクトのカンバンと同じチャット（しまったプロジェクトの分は除く）を、プロジェクトの画面・サイドバーと同じ数え方で
  const { chats } = useChats();
  const shownChats = chats.filter((r) => shown.some((p) => p.id === r.project_id));

  return (
    <div className="page page-wide page-board">
      <header className="page-header project-header">
        <div className="project-title-row">
          <h1>
            <ProjectSwitcher />
          </h1>
          <TagFilterNotice filter={tagFilter} />
          <div className="project-stats">
            <StateStats chats={shownChats} showProject />
          </div>
        </div>
      </header>
      {notReady && (
        <section className="section">
          <div className="card-grid">
            <StatusCard title="Claude Code" ok={providers.loading ? undefined : Boolean(claude?.logged_in)} detail={providers.error ?? claude?.detail ?? "確認中…"} />
            <GitHubStatusCard github={github} />
          </div>
        </section>
      )}
      {shown.length === 0 && all.length > 0 ? (
        // タグで絞り込んで、合うプロジェクトがないとき
        <EmptyState
          icon={Tag}
          title="合うプロジェクトがありません"
          actions={
            <button type="button" className="btn" onClick={tagFilter.clear}>
              絞り込みを外す
            </button>
          }
        >
          タグ「{tagFilter.selected.map(tagLabel).join("、")}」が付いたプロジェクトはありません。
        </EmptyState>
      ) : shown.length === 0 ? (
        <NoProjectsWelcome archived={archived.length} />
      ) : (
        <AllProjectsKanban />
      )}
    </div>
  );
}
