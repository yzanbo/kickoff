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
import { GroupBoard } from "../components/GroupBoard";
import { KanbanBoard } from "../components/KanbanBoard";
import { BUSY_STATUSES } from "../components/RunStatus";
import { SectionBadge } from "../components/SectionBadge";
import { TaskList } from "../components/TaskList";
import { ProjectEditDialog } from "../components/ProjectEditDialog";
import { ProjectSettings } from "../components/ProjectSettings";
import { useServerEvent } from "../events";
import { href, type ProjectTab } from "../router";
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
  settings: "設定",
};

/** プロジェクト画面: チャット一覧と、決まったこと（要件定義書・スケジュール・タスク・レポート）をタブで */
export function ProjectPage({
  id,
  tab,
  projects,
  focusRun,
}: {
  id: number;
  tab: ProjectTab;
  projects: ProjectSummary[];
  /** カンバンの右側のパネルで開くチャット（サイドバー・検索などから開いたとき） */
  focusRun?: { runId: number; focus?: number };
}) {
  const [data, setData] = useState<ProjectData>();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);

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
      setData({ project, tasks, artifacts, runs, groups, approvals: approvals.filter((a) => a.project_id === id) });
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    setData(undefined);
    void load();
  }, [load]);

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

  if (error && !data) return <div className="page error">{error}</div>;
  if (!data) return <div className="page muted">読み込み中…</div>;
  const { project, tasks, artifacts, runs, groups, approvals } = data;
  const waiting = runs.filter((r) => approvals.some((a) => a.run_id === r.id)).length;
  const working = runs.filter((r) => BUSY_STATUSES.includes(r.status)).length - waiting;

  return (
    <div className={`page page-wide ${tab === "board" || tab === "groups" ? "page-board" : ""}`}>
      <header className="page-header project-header">
        <div className="project-title-row">
          <h1>{project.name}</h1>
          <button className="btn btn-sm project-edit-button" title="プロジェクトの名前・既定の設定などを編集" onClick={() => setEditing(true)}>
            <Pencil size={13} /> 編集
          </button>
          <div className="project-stats">
            {waiting > 0 && <span className="stat stat-waiting">回答待ち {waiting}</span>}
            {working > 0 && <span className="stat stat-working">作業中 {working}</span>}
          </div>
          <span className="spacer" />
          <a className="btn btn-primary" href={href({ name: "newChat", projectId: project.id })}>
            <Plus size={15} /> 新しいチャット
          </a>
        </div>
        <button
          className="path-button"
          disabled={!window.kickoff}
          title={window.kickoff ? "Finder で開く" : undefined}
          onClick={() => void window.kickoff?.openPath(project.repo_path)}
        >
          <FolderOpen size={13} /> {project.repo_path}
        </button>
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
            </a>
          ))}
        </nav>
      </header>

      {tab === "board" && <KanbanBoard projectId={project.id} projects={projects} approvals={approvals} title="カンバン" focusRun={focusRun} />}
      {tab === "groups" && <GroupBoard projectId={project.id} runs={runs} groups={groups} approvals={approvals} />}
      {tab === "requirements" && <DocTab project={project} kind="requirements" artifacts={artifacts} />}
      {tab === "schedule" && <DocTab project={project} kind="schedule" artifacts={artifacts} />}
      {tab === "tasks" && (
        <section className="section">
          <TaskList projectId={project.id} tasks={tasks} phases={PHASES.filter((p) => p !== "schedule")} />
        </section>
      )}
      {tab === "reports" && <ReportsTab artifacts={artifacts} />}
      {tab === "settings" && <ProjectSettings project={project} />}
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
        <a className="btn" href={href({ name: "newChat", projectId: project.id, section: kind })}>
          <Plus size={14} /> {doc ? "チャットで見直す" : "チャットで作る"}
        </a>
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
