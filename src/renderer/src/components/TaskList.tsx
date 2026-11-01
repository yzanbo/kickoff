import { useState } from "react";
import {
  PHASE_LABELS,
  PHASES,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type Phase,
  type Task,
  type TaskStatus,
} from "../../../core/types";
import { api, type TaskInput } from "../api";
import { SectionBadge } from "./SectionBadge";
import { confirmDialog } from "../dialogs";
import { errorMessage } from "../errors";

const PRIORITY_LABELS: Record<number, string> = { 1: "高", 2: "中", 3: "低" };

/** フェーズごとのタスク一覧（追加・編集・削除） */
export function TaskList({ projectId, tasks, phases = PHASES }: { projectId: number; tasks: Task[]; phases?: readonly Phase[] }) {
  const [adding, setAdding] = useState<Phase | null>(null);

  return (
    <div className="task-groups">
      {phases.map((phase) => {
        const items = tasks.filter((t) => t.phase === phase);
        return (
          <div key={phase} className="task-group">
            <div className="task-group-head">
              <span className="task-group-title">
                <SectionBadge section={phase} /> <span className="muted small">{items.length}</span>
              </span>
              <button className="icon-button" title="タスクを追加" aria-label={`${PHASE_LABELS[phase]}にタスクを追加`} onClick={() => setAdding(phase)}>
                ＋
              </button>
            </div>
            {adding === phase && (
              <TaskForm
                initial={{ phase, title: "", description: "", acceptance_criteria: "", priority: 2 }}
                submitLabel="追加"
                onCancel={() => setAdding(null)}
                onSubmit={async (input) => {
                  await api.createTask(projectId, input);
                  setAdding(null);
                }}
              />
            )}
            {items.length === 0 && adding !== phase && <div className="muted small task-empty">タスクはありません</div>}
            {items.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <TaskForm
        initial={task}
        withStatus
        submitLabel="保存"
        onCancel={() => setEditing(false)}
        onSubmit={async (input) => {
          await api.updateTask(task.id, input);
          setEditing(false);
        }}
        onDelete={async () => {
          const ok = await confirmDialog({ title: `タスク「${task.title}」を削除しますか？`, confirmLabel: "削除", danger: true });
          if (ok) await api.deleteTask(task.id);
        }}
      />
    );
  }

  return (
    <div className={`task-row ${open ? "open" : ""}`}>
      <button className="task-summary" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`priority priority-${task.priority}`} title={`優先度: ${PRIORITY_LABELS[task.priority]}`}>
          {PRIORITY_LABELS[task.priority]}
        </span>
        <span className="task-title">
          #{task.id} {task.title}
        </span>
        {task.created_by === "agent" && <span className="badge">AI</span>}
        <span className={`task-status task-status-${task.status}`}>{TASK_STATUS_LABELS[task.status]}</span>
      </button>
      {open && (
        <div className="task-body">
          {task.description && <p className="prewrap">{task.description}</p>}
          {task.acceptance_criteria && (
            <>
              <div className="task-body-label">受け入れ基準</div>
              <p className="prewrap">{task.acceptance_criteria}</p>
            </>
          )}
          {task.summary && (
            <>
              <div className="task-body-label">AI の完了報告</div>
              <p className="prewrap">{task.summary}</p>
            </>
          )}
          <button className="btn" onClick={() => setEditing(true)}>
            編集
          </button>
        </div>
      )}
    </div>
  );
}

function TaskForm({
  initial,
  withStatus,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial: TaskInput & { status?: TaskStatus };
  withStatus?: boolean;
  submitLabel: string;
  onSubmit: (input: TaskInput & { status?: TaskStatus }) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const set = <K extends keyof typeof value>(key: K, v: (typeof value)[K]) => setValue((prev) => ({ ...prev, [key]: v }));

  return (
    <form
      className="task-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(undefined);
        try {
          await onSubmit({
            phase: value.phase,
            title: value.title,
            description: value.description,
            acceptance_criteria: value.acceptance_criteria,
            priority: value.priority,
            ...(withStatus ? { status: value.status } : {}),
          });
        } catch (err) {
          setError(errorMessage(err));
          setSaving(false);
        }
      }}
    >
      <input type="text" aria-label="タイトル" placeholder="タイトル" value={value.title} required autoFocus onChange={(e) => set("title", e.target.value)} />
      <textarea rows={3} aria-label="内容" placeholder="内容" value={value.description} onChange={(e) => set("description", e.target.value)} />
      <textarea
        rows={3}
        aria-label="受け入れ基準"
        placeholder="受け入れ基準"
        value={value.acceptance_criteria}
        onChange={(e) => set("acceptance_criteria", e.target.value)}
      />
      <div className="task-form-row">
        <select aria-label="フェーズ" value={value.phase} onChange={(e) => set("phase", e.target.value as Phase)}>
          {PHASES.map((p) => (
            <option key={p} value={p}>
              {PHASE_LABELS[p]}
            </option>
          ))}
        </select>
        <select aria-label="優先度" value={value.priority} onChange={(e) => set("priority", Number(e.target.value))}>
          {[1, 2, 3].map((p) => (
            <option key={p} value={p}>
              優先度: {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        {withStatus && (
          <select aria-label="ステータス" value={value.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <p className="error small">{error}</p>}
      <div className="task-form-actions">
        {onDelete && (
          <button type="button" className="btn btn-danger-text" onClick={() => void onDelete()}>
            削除
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || !value.title.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
