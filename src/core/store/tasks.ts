import type { DatabaseSync } from "node:sqlite";
import type { NewTask, Phase, Task, TaskStatus } from "../types.js";
import { touchProject, updateRow, type Notify, type Row } from "./common.js";

/** タスクの変えられる項目 */
export type TaskPatch = Partial<
  Pick<Task, "phase" | "title" | "description" | "acceptance_criteria" | "status" | "priority" | "summary" | "branch" | "worktree_path" | "pr_url">
>;

const TASK_COLUMNS = ["phase", "title", "description", "acceptance_criteria", "status", "priority", "summary", "branch", "worktree_path", "pr_url"] as const;

/** タスク（セクションごとの作業の単位。エージェントが起票・更新する） */
export function createTaskStore(db: DatabaseSync, onChange: Notify) {
  const get = (id: number): Task | undefined => db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as unknown as Task | undefined;
  return {
    get,
    list(projectId: number, filter: { phase?: Phase; status?: TaskStatus } = {}): Task[] {
      const where = ["project_id = $project_id"];
      const params: Row = { project_id: projectId };
      if (filter.phase) {
        where.push("phase = $phase");
        params.phase = filter.phase;
      }
      if (filter.status) {
        where.push("status = $status");
        params.status = filter.status;
      }
      return db.prepare(`SELECT * FROM tasks WHERE ${where.join(" AND ")} ORDER BY priority ASC, id ASC`).all(params) as unknown as Task[];
    },
    create(input: NewTask): Task {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO tasks (project_id, phase, title, description, acceptance_criteria, priority, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.project_id,
          input.phase,
          input.title,
          input.description ?? "",
          input.acceptance_criteria ?? "",
          input.priority ?? 2,
          input.status ?? "todo",
          input.created_by ?? "user",
        );
      const task = get(Number(lastInsertRowid))!;
      touchProject(db, task.project_id);
      onChange({ type: "task", task });
      return task;
    },
    update(id: number, patch: TaskPatch): Task {
      updateRow(db, "tasks", id, patch as Row, TASK_COLUMNS);
      const task = get(id)!;
      touchProject(db, task.project_id);
      onChange({ type: "task", task });
      return task;
    },
    delete(id: number) {
      const task = get(id);
      if (!task) return;
      db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
      onChange({ type: "task_deleted", id, project_id: task.project_id });
    },
  };
}
