import { FolderOpen, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  ARTIFACT_KIND_LABELS,
  PHASES,
  type Approval,
  type Artifact,
  type Project,
  type ProjectSummary,
  type Run,
  type RunGroup,
  type Task,
} from "../../../core/types";
import { api } from "../api";
import { Markdown } from "../components/Markdown";
import { GroupBoard } from "../components/board/GroupBoard";
import { KanbanBoard } from "../components/board/KanbanBoard";
import { BUSY_STATUSES } from "../components/RunStatus";
import { SectionBadge } from "../components/SectionBadge";
import { TaskList } from "../components/TaskList";
import { ProjectEditDialog } from "../components/ProjectEditDialog";
import { ProjectSwitcher } from "../components/ProjectSwitcher";
import { ChangesTab } from "../components/changes/ChangesTab";
import { useGitStatus } from "../components/changes/useGitStatus";
import { errorMessage } from "../errors";
import { useServerEvent } from "../events";
import { href, openNewChat, type ProjectTab, type ReopenRoute } from "../router";
import { REPORT_KINDS, SECTION_META } from "../sections";

interface ProjectData {
  project: Project;
  tasks: Task[];
  artifacts: Artifact[];
  runs: Run[];
  groups: RunGroup[];
  approvals: Approval[];
}

const TAB_LABELS: Record<ProjectTab, string> = {
  board: "ボード",
  groups: "グループ",
  requirements: "要件定義書",
  schedule: "スケジュール",
  tasks: "タスク",
  reports: "レポート",
  changes: "エディタ",
};

/** プロジェクト画面: チャット一覧と、決まったこと（要件定義書・スケジュール・タスク・レポート）をタブで */
/** プロジェクトごとの直前のデータ（プロジェクトを切り替えたときに、すぐ出すため） */
const projectCache = new Map<number, ProjectData>();

export function ProjectPage({
  id,
  tab,
  projects,
  focus,
  highlightGroup,
}: {
  id: number;
  tab: ProjectTab;
  projects: ProjectSummary[];
  /** カンバンの右側のパネルで開くチャット・新しいチャット（サイドバー・検索などから開いたとき） */
  focus?: ReopenRoute;
  /** グループのタブで目立たせるグループ（サイドバーのグループ名から来たとき） */
  highlightGroup?: number;
}) {
  // 一度開いたプロジェクトは、切り替えたときにすぐ出す（裏で読み直す。「読み込み中」を挟んでちらつかないように）
  const [data, setData] = useState<ProjectData | undefined>(() => projectCache.get(id));
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  // Git の変更（タブのバッジに数を出し、変更のタブで一覧と差分を出す）
  const git = useGitStatus(id, tab === "changes");

  const load = useCallback(async () => {
    try {
      const [project, tasks, artifacts, runs, groups, approvals] = await Promise.all([
        api.project(id),
        api.tasks(id),
        api.artifacts(id),
        api.runs(id),
        api.groups(id),
        api.approvals(),
      ]);
      const next = { project, tasks, artifacts, runs, groups, approvals: approvals.filter((a) => a.project_id === id) };
      projectCache.set(id, next);
      setData(next);
      setError(undefined);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    // 覚えていればそれを出す。初めてのプロジェクトは、読み終わるまで前の画面を薄くして残す
    const cached = projectCache.get(id);
    if (cached) setData(cached);
    void load();
  }, [id, load]);

  useServerEvent((e) => {
    const related =
      (e.type === "project" && e.project.id === id) ||
      (e.type === "task" && e.task.project_id === id) ||
      (e.type === "task_deleted" && e.project_id === id) ||
      (e.type === "artifact" && e.artifact.project_id === id) ||
      (e.type === "run" && e.run.project_id === id) ||
      (e.type === "run_deleted" && e.project_id === id) ||
      (e.type === "group" && e.group.project_id === id) ||
      (e.type === "group_deleted" && e.project_id === id) ||
      (e.type === "approval" && e.approval.project_id === id) ||
      e.type === "approval_resolved";
    if (related) void load();
  });

  // 切り替えた直後も、覚えている内容があれば最初の描画から使う（前のプロジェクトが一瞬映らないように）
  const shown = data?.project.id === id ? data : (projectCache.get(id) ?? data);
  if (error && !shown) return <div className="page error">{error}</div>;
  if (!shown) return <div className="page muted">読み込み中…</div>;
  const { project, tasks, artifacts, runs, groups, approvals } = shown;
  // 別のプロジェクトを読み込んでいる途中（前の画面を薄くして出しておく）
  const stale = project.id !== id;
  const waiting = runs.filter((r) => approvals.some((a) => a.run_id === r.id)).length;
  const working = runs.filter((r) => BUSY_STATUSES.includes(r.status)).length - waiting;

  return (
    <div className={`page page-wide ${tab === "board" || tab === "groups" || tab === "changes" ? "page-board" : ""} ${stale ? "is-stale" : ""}`}>
      <header className="page-header project-header">
        <div className="project-title-row">
          <h1>
            <ProjectSwitcher project={project} projects={projects} tab={tab} />
          </h1>
          <button className="btn btn-sm project-edit-button" title="プロジェクトの名前・既定の設定などを編集" onClick={() => setEditing(true)}>
            <Pencil size={13} /> 編集
          </button>
          {/* フォルダの場所（名前の横に並べ、見出しを 1 行に収める） */}
          <button
            className="path-button"
            disabled={!window.kickoff}
            title={window.kickoff ? `Finder で開く（${project.repo_path}）` : project.repo_path}
            onClick={() => void window.kickoff?.openPath(project.repo_path)}
          >
            <FolderOpen size={13} aria-hidden />
            <span className="path-button-text">{project.repo_path}</span>
          </button>
          <div className="project-stats">
            {waiting > 0 && <span className="stat stat-waiting">回答待ち {waiting}</span>}
            {working > 0 && <span className="stat stat-working">作業中 {working}</span>}
          </div>
        </div>
        <nav className="tabs" role="tablist">
          {(Object.keys(TAB_LABELS) as ProjectTab[]).map((t) => (
            <a
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`tab ${tab === t ? "active" : ""}`}
              href={href({ name: "project", id: project.id, tab: t })}
            >
              {TAB_LABELS[t]}
              {t === "tasks" && tasks.length > 0 && <span className="tab-count">{tasks.length}</span>}
              {t === "board" && runs.length > 0 && <span className="tab-count">{runs.length}</span>}
              {t === "groups" && groups.length > 0 && <span className="tab-count">{groups.length}</span>}
              {t === "changes" && git.count > 0 && (
                <span className="change-count" aria-label={`変更のあるファイル ${git.count} 件`}>
                  {git.count}
                </span>
              )}
            </a>
          ))}
        </nav>
      </header>

      {tab === "board" && <KanbanBoard projectId={project.id} projects={projects} approvals={approvals} title="カンバン" focus={focus} />}
      {tab === "groups" && <GroupBoard projectId={project.id} runs={runs} groups={groups} approvals={approvals} focus={focus} highlight={highlightGroup} />}
      {tab === "requirements" && <DocTab project={project} kind="requirements" artifacts={artifacts} />}
      {tab === "schedule" && <DocTab project={project} kind="schedule" artifacts={artifacts} />}
      {tab === "tasks" && (
        <section className="section">
          <TaskList projectId={project.id} tasks={tasks} phases={PHASES.filter((p) => p !== "schedule")} />
        </section>
      )}
      {tab === "reports" && <ReportsTab artifacts={artifacts} />}
      {tab === "changes" && <ChangesTab projectId={project.id} repoPath={project.repo_path} git={git} />}
      {editing && <ProjectEditDialog project={project} onClose={() => setEditing(false)} />}
    </div>
  );
}

function DocTab({ project, kind, artifacts }: { project: Project; kind: "requirements" | "schedule"; artifacts: Artifact[] }) {
  const doc = artifacts.find((a) => a.kind === kind);
  return (
    <section className="section">
      <div className="doc-toolbar">
        <SectionBadge section={kind} />
        {doc && (
          <span className="muted small">
            {doc.file_path && `${doc.file_path} ・ `}
            {new Date(doc.created_at).toLocaleString("ja-JP")} 更新
          </span>
        )}
        <span className="spacer" />
        <button className="btn" onClick={() => openNewChat(project.id, { section: kind })}>
          <Plus size={14} /> {doc ? "チャットで見直す" : "チャットで作る"}
        </button>
      </div>
      {doc ? (
        <article className="doc-card">
          <Markdown>{doc.content}</Markdown>
        </article>
      ) : (
        <div className="empty">まだありません。{SECTION_META[kind].label}のチャットで AI と話すと、ここにまとまります。</div>
      )}
    </section>
  );
}

function ReportsTab({ artifacts }: { artifacts: Artifact[] }) {
  const reports = artifacts.filter((a) => REPORT_KINDS.includes(a.kind));
  if (reports.length === 0) return <div className="empty">テストレポートやデプロイログはまだありません。</div>;
  return (
    <section className="section">
      {reports.map((a) => (
        <details key={a.id} className="report">
          <summary>
            <span className="badge">{ARTIFACT_KIND_LABELS[a.kind]}</span>
            <span className="report-title">{a.title}</span>
            <span className="muted small">{new Date(a.created_at).toLocaleString("ja-JP")}</span>
          </summary>
          <div className="doc-card">
            <Markdown>{a.content}</Markdown>
          </div>
        </details>
      ))}
    </section>
  );
}
