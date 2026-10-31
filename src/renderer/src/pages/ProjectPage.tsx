import { useCallback, useEffect, useState } from "react";
import { PHASE_LABELS, PHASES, type Approval, type Project, type Run, type Task } from "../../../core/types";
import { api } from "../api";
import { WriteScopeEditor } from "../components/WriteScopeEditor";
import { useServerEvent } from "../events";
import { href, navigate } from "../router";
import { SECTION_DESCRIPTIONS } from "../sections";
import { RunList } from "./SectionPage";

interface ProjectData {
  project: Project;
  tasks: Task[];
  runs: Run[];
  approvals: Approval[];
}

const BUSY = ["queued", "running", "waiting"];

/** プロジェクトの全体画面: 回答待ち・作業中のチャットと、セクションごとの状況 */
export function ProjectPage({ id }: { id: number }) {
  const [data, setData] = useState<ProjectData>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [project, tasks, runs, approvals] = await Promise.all([api.project(id), api.tasks(id), api.runs(id), api.approvals()]);
      setData({ project, tasks, runs, approvals: approvals.filter((a) => a.project_id === id) });
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
      (e.type === "run" && e.run.project_id === id) ||
      (e.type === "approval" && e.approval.project_id === id) ||
      e.type === "approval_resolved";
    if (related) void load();
  });

  if (error && !data) return <div className="page error">{error}</div>;
  if (!data) return <div className="page muted">読み込み中…</div>;
  const { project, tasks, runs, approvals } = data;
  // 全体画面にはチャットの中身を出さず、チャットへのリンクだけを並べる
  const waitingRuns = runs.filter((r) => approvals.some((a) => a.run_id === r.id));
  const workingRuns = runs.filter((r) => BUSY.includes(r.status) && !waitingRuns.includes(r));

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

      {waitingRuns.length > 0 && (
        <section className="section">
          <h2>回答待ちのチャット</h2>
          <RunList projectId={project.id} runs={waitingRuns} approvals={approvals} showSection />
        </section>
      )}

      {workingRuns.length > 0 && (
        <section className="section">
          <h2>作業中のチャット</h2>
          <RunList projectId={project.id} runs={workingRuns} approvals={approvals} showSection />
        </section>
      )}

      <section className="section">
        <h2>セクション</h2>
        <div className="section-cards">
          {PHASES.map((section) => {
            const sectionRuns = runs.filter((r) => r.phase === section);
            const sectionTasks = tasks.filter((t) => t.phase === section);
            const done = sectionTasks.filter((t) => t.status === "done").length;
            return (
              <a key={section} className="section-card" href={href({ name: "section", projectId: project.id, section })}>
                <div className="section-card-title">{PHASE_LABELS[section]}</div>
                <div className="muted small">{SECTION_DESCRIPTIONS[section]}</div>
                <div className="section-card-stats small">
                  <span>チャット {sectionRuns.length}</span>
                  {sectionTasks.length > 0 && (
                    <span>
                      タスク {done}/{sectionTasks.length}
                    </span>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {project.description.trim() && (
        <section className="section">
          <h2>概要・アイデア</h2>
          <p className="prewrap">{project.description}</p>
        </section>
      )}

      <section className="section" id="settings">
        <h2>プロジェクト設定</h2>
        <h3 className="subheading">書き込みできるフォルダ</h3>
        <p className="muted small">
          要件定義とスケジュールのチャットで、AI がファイルを書き込めるフォルダです。ここ以外への書き込みと、読み取り以外のコマンドは、権限モードに関係なく拒否されます。
        </p>
        <WriteScopeEditor project={project} />
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
