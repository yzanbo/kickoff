// チャットの ToDo（エージェントが TodoWrite / TaskCreate・TaskUpdate で付けた作業の一覧）
import type { RunEvent } from "@shared/types";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  key: string;
  /** やること */
  content: string;
  /** 作業中の言い方（「テストを流しています」など。なければ content） */
  activeForm?: string;
  status: TodoStatus;
}

const asStatus = (value: unknown): TodoStatus => (value === "in_progress" || value === "completed" ? value : "pending");

/**
 * メインのエージェントのツールの呼び出しから、いまの ToDo を組み立てる。
 * TodoWrite は毎回すべてを書き直す（最後のものが今の一覧）。TaskCreate は 1 件ずつ足し（番号は結果の「Task #3」から）、
 * TaskUpdate は番号で状態を変える（deleted は消す）。TodoWrite と Task の両方があれば、後に使った方を見る
 */
export function collectTodos(events: RunEvent[]): TodoItem[] {
  let written: TodoItem[] = [];
  const tasks = new Map<string, TodoItem>();
  const pendingCreate = new Map<string, { content: string; activeForm?: string }>();
  let last: "write" | "task" | null = null;
  for (const e of events) {
    const data = e.data as { name?: string; input?: Record<string, unknown>; id?: string; parent?: string; tool_use_id?: string; content?: string; is_error?: boolean };
    if (data.parent) continue;
    if (e.type === "tool_use" && data.name === "TodoWrite") {
      const todos = Array.isArray(data.input?.todos) ? (data.input.todos as Record<string, unknown>[]) : [];
      written = todos.map((t, i) => ({
        key: `w${i}`,
        content: String(t.content ?? ""),
        activeForm: typeof t.activeForm === "string" ? t.activeForm : undefined,
        status: asStatus(t.status),
      }));
      last = "write";
    } else if (e.type === "tool_use" && data.name === "TaskCreate" && data.id) {
      pendingCreate.set(data.id, {
        content: String(data.input?.subject ?? data.input?.description ?? ""),
        activeForm: typeof data.input?.activeForm === "string" ? data.input.activeForm : undefined,
      });
    } else if (e.type === "tool_result" && data.tool_use_id && pendingCreate.has(data.tool_use_id)) {
      const created = pendingCreate.get(data.tool_use_id)!;
      pendingCreate.delete(data.tool_use_id);
      const id = /Task #(\w+)/.exec(String(data.content ?? ""))?.[1];
      if (!data.is_error && id) {
        tasks.set(id, { key: `t${id}`, ...created, status: "pending" });
        last = "task";
      }
    } else if (e.type === "tool_use" && data.name === "TaskUpdate") {
      const id = String(data.input?.taskId ?? "");
      const task = tasks.get(id);
      if (!task) continue;
      if (data.input?.status === "deleted") tasks.delete(id);
      else {
        tasks.set(id, {
          ...task,
          ...(typeof data.input?.subject === "string" ? { content: data.input.subject } : {}),
          ...(typeof data.input?.activeForm === "string" ? { activeForm: data.input.activeForm } : {}),
          ...(data.input?.status ? { status: asStatus(data.input.status) } : {}),
        });
      }
      last = "task";
    }
  }
  return last === "task" ? [...tasks.values()] : written;
}
