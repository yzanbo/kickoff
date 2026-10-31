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
import { ApprovalCard } from "../components/ApprovalCard";
import { Markdown } from "../components/Markdown";
import { PhaseStepper } from "../components/PhaseStepper";
import { RunOptionsBar, useRunOptions } from "../components/RunOptionsBar";
import { TaskList } from "../components/TaskList";
import { useServerEvent } from "../events";
import { href, navigate } from "../router";
import { RUN_STATUS_LABELS } from "./RunPage";

interface ProjectData {
  project: Project;
  tasks: Task[];
  artifacts: Artifact[];
  runs: Run[];
  approvals: Approval[];
}

const BUSY = ["queued", "running", "waiting"];

/** プロジェクトの全体画面。phase を渡すと、そのフェーズだけの画面になる */
export function ProjectPage({ id, phase }: { id: number; phase?: Phase }) {
  const [data, setData] = useState<ProjectData>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [project, tasks, artifacts, runs, approvals] = await Promise.all([
        api.project(id),
        api.tasks(id),
        api.artifacts(id),
        api.runs(id),
        api.approvals(),
      ]);
      setData({ project, tasks, artifacts, runs, approvals: approvals.filter((a) => a.project_id === id) });
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    setData(undefined);
    void load();
  }, [load]);

  // このプロジェクトに関係する変更が届いたら読み直す
  useServerEvent((e) => {
    const related =
      (e.type === "project" && e.project.id === id) ||
      (e.type === "task" && e.task.project_id === id) ||
      (e.type === "task_deleted" && e.project_id === id) ||
      (e.type === "artifact" && e.artifact.project_id === id) ||
      (e.type === "run" && e.run.project_id === id) ||
      (e.type === "approval" && e.approval.project_id === id) ||
      e.type === "approval_resolved";
    if (related) void load();
  });

  if (error && !data) return <div className="page error">{error}</div>;
  if (!data) return <div className="page muted">読み込み中…</div>;
  const { project, tasks, artifacts, runs, approvals } = data;
  const requirementsDoc = artifacts.find((a) => a.kind === "requirements");
  const phaseState = phase ? phaseStateOf(project.current_phase, phase) : "current";
  const visibleRuns = phase ? runs.filter((r) => r.phase === phase) : runs;
  const visibleApprovals = phase ? approvals.filter((a) => visibleRuns.some((r) => r.id === a.run_id)) : approvals;
  // 全体画面では、タスクのない「要件定義」グループは出さない
  const taskPhases: readonly Phase[] = phase
    ? [phase]
    : PHASES.filter((p) => p !== "requirements" || tasks.some((t) => t.phase === "requirements"));
  const otherArtifacts = artifacts.filter((a) => a.kind !== "requirements" && (!phase || a.phase === phase));

  return (
    <div className="page">
      <header className="page-header">
        {phase ? (
          <>
            <a className="muted small breadcrumb" href={href({ name: "project", id: project.id })}>
              {project.name}
            </a>
            <h1>{PHASE_LABELS[phase]}</h1>
          </>
        ) : (
          <h1>{project.name}</h1>
        )}
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

      <PhaseStepper projectId={project.id} current={project.current_phase} selected={phase} />

      {phaseState === "current" ? (
        <section className="next-card">
          <div className="next-label">次にやること</div>
          <NextAction project={project} tasks={tasks} runs={runs} approvals={approvals} hasDoc={Boolean(requirementsDoc)} />
        </section>
      ) : (
        <section className={`phase-note phase-note-${phaseState}`}>
          {phaseState === "done" ? "✓ このフェーズは完了しています。" : "まだこのフェーズには進んでいません。"}
          現在のフェーズは「
          <a href={href({ name: "phase", projectId: project.id, phase: project.current_phase })}>
            {PHASE_LABELS[project.current_phase]}
          </a>
          」です。
        </section>
      )}

      {visibleApprovals.length > 0 && (
        <section className="section">
          {visibleApprovals.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
        </section>
      )}

      {requirementsDoc && (!phase || phase === "requirements") && (
        <RequirementsDoc doc={requirementsDoc} confirmed={Boolean(project.requirements_confirmed_at)} />
      )}

      {(phase || tasks.length > 0 || project.requirements_confirmed_at || project.current_phase !== "requirements") && (
        <section className="section">
          <h2>タスク</h2>
          <TaskList projectId={project.id} tasks={tasks} phases={taskPhases} />
        </section>
      )}

      {otherArtifacts.length > 0 && (
        <section className="section">
          <h2>成果物</h2>
          {otherArtifacts.map((a) => (
            <details key={a.id} className="artifact">
              <summary>
                <span className="badge">{ARTIFACT_KIND_LABELS[a.kind]}</span> {a.title}
                <span className="muted small"> ・ {new Date(a.created_at).toLocaleString("ja-JP")}</span>
              </summary>
              <div className="doc-card">
                <Markdown>{a.content}</Markdown>
              </div>
            </details>
          ))}
        </section>
      )}

      {visibleRuns.length > 0 && (
        <section className="section">
          <h2>会話</h2>
          <ul className="run-list">
            {visibleRuns.map((r) => (
              <li key={r.id}>
                <a className="run-item" href={href({ name: "run", projectId: project.id, runId: r.id })}>
                  <span className="run-item-title">{r.title || "会話"}</span>
                  <span className="muted small">{PHASE_LABELS[r.phase]}</span>
                  <span className={`status-chip status-${r.status}`}>{RUN_STATUS_LABELS[r.status]}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!phase && project.description.trim() && (
        <section className="section">
          <h2>概要・アイデア</h2>
          <p className="prewrap">{project.description}</p>
        </section>
      )}

      {!phase && (
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
      )}
    </div>
  );
}

function phaseStateOf(current: Phase, phase: Phase): "done" | "current" | "upcoming" {
  const diff = PHASES.indexOf(phase) - PHASES.indexOf(current);
  return diff < 0 ? "done" : diff === 0 ? "current" : "upcoming";
}

function RequirementsDoc({ doc, confirmed }: { doc: Artifact; confirmed: boolean }) {
  const [open, setOpen] = useState(!confirmed);
  return (
    <section className="section">
      <div className="section-head">
        <h2>
          要件定義書 {confirmed ? <span className="badge ok">確定済み</span> : <span className="badge">下書き</span>}
        </h2>
        <button className="btn" onClick={() => setOpen(!open)}>
          {open ? "閉じる" : "開く"}
        </button>
      </div>
      <p className="muted small">
        {doc.file_path && `${doc.file_path} ・ `}
        {new Date(doc.created_at).toLocaleString("ja-JP")} 更新
      </p>
      {open && (
        <div className="doc-card">
          <Markdown>{doc.content}</Markdown>
        </div>
      )}
    </section>
  );
}

/** フェーズと進み具合から「次にやること」を決める */
function NextAction({
  project,
  tasks,
  runs,
  approvals,
  hasDoc,
}: {
  project: Project;
  tasks: Task[];
  runs: Run[];
  approvals: Approval[];
  hasDoc: boolean;
}) {
  const options = useRunOptions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const latest = runs.find((r) => r.phase === "requirements");
  const busy = latest ? BUSY.includes(latest.status) : false;
  const openLatest = latest ? (
    <a className="btn" href={href({ name: "run", projectId: project.id, runId: latest.id })}>
      会話を開く
    </a>
  ) : null;

  async function act(fn: () => Promise<unknown>) {
    setPending(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  const startAndOpen = (start: () => Promise<Run>) =>
    act(async () => {
      const run = await start();
      navigate({ name: "run", projectId: project.id, runId: run.id });
    });

  if (project.current_phase !== "requirements") {
    return (
      <>
        <div className="next-title">{PHASE_LABELS[project.current_phase]}フェーズ</div>
        <p className="muted">タスクを AI に任せて進める機能は次のマイルストーン（M2）で対応します。</p>
      </>
    );
  }

  const confirmed = Boolean(project.requirements_confirmed_at);
  const implTasks = tasks.filter((t) => t.phase === "implementation");
  let body: React.ReactNode;

  if (approvals.length > 0) {
    body = (
      <>
        <div className="next-title">AI から{approvals.some((a) => a.kind === "question") ? "質問" : "承認依頼"}が届いています</div>
        <p className="muted">下のカードで回答すると、AI が作業を続けます。</p>
      </>
    );
  } else if (!confirmed && !latest) {
    body = (
      <>
        <div className="next-title">要件定義を始めましょう</div>
        <p className="muted">アイデアをもとに AI が質問しながら要件を詰め、要件定義書（技術スタック・デプロイ方法を含む）を作ります。</p>
        <div className="next-actions">
          <RunOptionsBar state={options} />
          <button
            className="btn btn-primary"
            disabled={pending}
            onClick={() => void startAndOpen(() => api.startRequirements(project.id, options.options))}
          >
            AI と要件定義を始める
          </button>
        </div>
      </>
    );
  } else if (!confirmed && busy) {
    body = (
      <>
        <div className="next-title">AI と要件定義を進めています</div>
        <div className="next-actions">{openLatest}</div>
      </>
    );
  } else if (!confirmed && !hasDoc) {
    body = (
      <>
        <div className="next-title">会話を続けて要件定義書を作りましょう</div>
        <p className="muted">AI の質問に答えたり、追加の要望を伝えたりしてください。</p>
        <div className="next-actions">{openLatest}</div>
      </>
    );
  } else if (!confirmed) {
    body = (
      <>
        <div className="next-title">要件定義書を確認して確定してください</div>
        <p className="muted">確定すると、AI が要件定義書をもとにタスクを分解します。直したい点があれば会話を続けてください。</p>
        <div className="next-actions">
          <RunOptionsBar state={options} />
          <button
            className="btn btn-primary"
            disabled={pending}
            onClick={() => void startAndOpen(() => api.confirmRequirements(project.id, options.options))}
          >
            要件定義書を確定してタスク分解へ
          </button>
          {openLatest}
        </div>
      </>
    );
  } else if (busy) {
    body = (
      <>
        <div className="next-title">AI がタスクを分解しています</div>
        <div className="next-actions">{openLatest}</div>
      </>
    );
  } else if (implTasks.length > 0) {
    body = (
      <>
        <div className="next-title">タスクを確認して承認してください</div>
        <p className="muted">
          実装タスク {implTasks.length} 件。下の一覧で編集・追加・削除できます。承認すると実装フェーズに進みます。
        </p>
        <div className="next-actions">
          <button className="btn btn-primary" disabled={pending} onClick={() => void act(() => api.advance(project.id))}>
            承認して実装フェーズへ進む
          </button>
          <button className="btn" disabled={pending} onClick={() => void act(() => api.reopenRequirements(project.id))}>
            要件定義書を見直す
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className="next-title">実装タスクがまだありません</div>
        <p className="muted">AI にもう一度分解を依頼するか、下の一覧から手動で追加してください。</p>
        <div className="next-actions">
          <RunOptionsBar state={options} />
          <button
            className="btn btn-primary"
            disabled={pending}
            onClick={() => void startAndOpen(() => api.confirmRequirements(project.id, options.options))}
          >
            もう一度タスク分解を依頼
          </button>
          <button className="btn" disabled={pending} onClick={() => void act(() => api.reopenRequirements(project.id))}>
            要件定義書を見直す
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {body}
      {error && <p className="error small">{error}</p>}
    </>
  );
}
