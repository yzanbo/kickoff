import { useCallback, useEffect, useState } from "react";
import {
  ARTIFACT_KIND_LABELS,
  PHASE_LABELS,
  PHASES,
  type Approval,
  type Artifact,
  type Phase,
  type Project,
  type Run,
  type Task,
} from "../../../core/types";
import { api } from "../api";
import { Markdown } from "../components/Markdown";
import { TaskList } from "../components/TaskList";
import { useServerEvent } from "../events";
import { href } from "../router";
import { SECTION_ARTIFACTS, SECTION_DESCRIPTIONS, SECTION_TASKS } from "../sections";
import { RUN_STATUS_LABELS } from "./RunPage";

interface SectionData {
  project: Project;
  tasks: Task[];
  artifacts: Artifact[];
  runs: Run[];
  approvals: Approval[];
}

/** セクションの画面: 新しいチャット・決まったこと（成果物・タスク）・チャット一覧 */
export function SectionPage({ projectId, section }: { projectId: number; section: Phase }) {
  const [data, setData] = useState<SectionData>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [project, tasks, artifacts, runs, approvals] = await Promise.all([
        api.project(projectId),
        api.tasks(projectId),
        api.artifacts(projectId),
        api.runs(projectId),
        api.approvals(),
      ]);
      setData({ project, tasks, artifacts, runs, approvals: approvals.filter((a) => a.project_id === projectId) });
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [projectId]);

  useEffect(() => {
    setData(undefined);
    void load();
  }, [load]);

  useServerEvent((e) => {
    const related =
      (e.type === "project" && e.project.id === projectId) ||
      (e.type === "task" && e.task.project_id === projectId) ||
      (e.type === "task_deleted" && e.project_id === projectId) ||
      (e.type === "artifact" && e.artifact.project_id === projectId) ||
      (e.type === "run" && e.run.project_id === projectId) ||
      (e.type === "approval" && e.approval.project_id === projectId) ||
      e.type === "approval_resolved";
    if (related) void load();
  });

  if (error && !data) return <div className="page error">{error}</div>;
  if (!data) return <div className="page muted">読み込み中…</div>;

  const { project, tasks, artifacts, runs, approvals } = data;
  const sectionRuns = runs.filter((r) => r.phase === section);
  // 成果物は種類ごとに最新のものだけを表示する
  const latestArtifacts = SECTION_ARTIFACTS[section]
    .map((kind) => artifacts.find((a) => a.kind === kind))
    .filter((a): a is Artifact => Boolean(a));
  // 全体を見るセクションでは、タスクのあるグループだけを出す
  const taskPhases =
    SECTION_TASKS[section] === "all"
      ? PHASES.filter((p) => tasks.some((t) => t.phase === p))
      : (SECTION_TASKS[section] as Phase[]);
  const showTasks = SECTION_TASKS[section] !== "all" || tasks.length > 0;

  return (
    <div className="page">
      <header className="page-header">
        <a className="muted small breadcrumb" href={href({ name: "project", id: project.id })}>
          {project.name}
        </a>
        <h1>{PHASE_LABELS[section]}</h1>
        <p className="muted">{SECTION_DESCRIPTIONS[section]}</p>
        {(section === "requirements" || section === "schedule") && (
          <p className="muted small scope-note">
            書き込みできるフォルダ:{" "}
            {(project.write_scopes?.[section] ?? ["docs"]).map((f) => (f === "." ? "リポジトリ全体" : `${f}/`)).join("、") || "なし"}
            （<a href={href({ name: "project", id: project.id })}>プロジェクト設定で変更</a>）
          </p>
        )}
      </header>

      <section className="section">
        <a className="btn btn-primary" href={href({ name: "newChat", projectId: project.id, section })}>
          ＋ 新しいチャット
        </a>
      </section>

      {sectionRuns.length > 0 && (
        <section className="section">
          <h2>チャット</h2>
          <RunList projectId={project.id} runs={sectionRuns} approvals={approvals} />
        </section>
      )}

      {latestArtifacts.map((a) => (
        <ArtifactPanel key={a.id} artifact={a} />
      ))}

      {showTasks && (
        <section className="section">
          <h2>タスク</h2>
          <TaskList projectId={project.id} tasks={tasks} phases={taskPhases} />
        </section>
      )}
    </div>
  );
}

export function RunList({
  projectId,
  runs,
  approvals,
  showSection,
}: {
  projectId: number;
  runs: Run[];
  approvals: Approval[];
  /** どのセクションのチャットかを表示する（全体画面用） */
  showSection?: boolean;
}) {
  return (
    <ul className="run-list">
      {runs.map((r) => {
        const waiting = approvals.some((a) => a.run_id === r.id);
        return (
          <li key={r.id}>
            <a className="run-item" href={href({ name: "run", projectId, runId: r.id })}>
              <span className="run-item-title">{r.title || "チャット"}</span>
              {showSection && <span className="badge">{PHASE_LABELS[r.phase]}</span>}
              <span className="muted small">{new Date(r.updated_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              <span className={`status-chip status-${waiting ? "waiting" : r.status}`}>
                {waiting ? "回答待ち" : RUN_STATUS_LABELS[r.status]}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function ArtifactPanel({ artifact }: { artifact: Artifact }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="section">
      <div className="section-head">
        <h2>{ARTIFACT_KIND_LABELS[artifact.kind]}</h2>
        <button className="btn" onClick={() => setOpen(!open)}>
          {open ? "閉じる" : "開く"}
        </button>
      </div>
      <p className="muted small">
        {artifact.file_path && `${artifact.file_path} ・ `}
        {new Date(artifact.created_at).toLocaleString("ja-JP")} 更新
      </p>
      {open && (
        <div className="doc-card">
          <Markdown>{artifact.content}</Markdown>
        </div>
      )}
    </section>
  );
}
