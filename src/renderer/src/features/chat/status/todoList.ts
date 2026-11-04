// チャットの ToDo（エージェントが TodoWrite / TaskCreate・TaskUpdate で付けた作業の一覧）
import type { ChatEvent } from "@shared/types";

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
export function collectTodos(events: ChatEvent[]): TodoItem[] {
  let written: TodoItem[] = [];
  const tasks = new Map<string, TodoItem>();
  const pendingCreate = new Map<string, { content: string; activeForm?: string }>();
  let last: "write" | "task" | null = null;
  for (const e of events) {
    // サブエージェントの ToDo は数えない
    if (e.type === "tool_result") {
      if (e.data.parent || !pendingCreate.has(e.data.tool_use_id)) continue;
      const created = pendingCreate.get(e.data.tool_use_id)!;
      pendingCreate.delete(e.data.tool_use_id);
      const id = /Task #(\w+)/.exec(e.data.content)?.[1];
      if (!e.data.is_error && id) {
        tasks.set(id, { key: `t${id}`, ...created, status: "pending" });
        last = "task";
      }
      continue;
    }
    if (e.type !== "tool_use" || e.data.parent) continue;
    const { name } = e.data;
    const input = (e.data.input ?? {}) as Record<string, unknown>;
    if (name === "TodoWrite") {
      const todos = Array.isArray(input.todos) ? (input.todos as Record<string, unknown>[]) : [];
      written = todos.map((t, i) => ({
        key: `w${i}`,
        content: String(t.content ?? ""),
        activeForm: typeof t.activeForm === "string" ? t.activeForm : undefined,
        status: asStatus(t.status),
      }));
      last = "write";
    } else if (name === "TaskCreate") {
      pendingCreate.set(e.data.id, {
        content: String(input.subject ?? input.description ?? ""),
        activeForm: typeof input.activeForm === "string" ? input.activeForm : undefined,
      });
    } else if (name === "TaskUpdate") {
      const id = String(input.taskId ?? "");
      const task = tasks.get(id);
      if (!task) continue;
      if (input.status === "deleted") tasks.delete(id);
      else {
        tasks.set(id, {
          ...task,
          ...(typeof input.subject === "string" ? { content: input.subject } : {}),
          ...(typeof input.activeForm === "string" ? { activeForm: input.activeForm } : {}),
          ...(input.status ? { status: asStatus(input.status) } : {}),
        });
      }
      last = "task";
    }
  }
  return last === "task" ? [...tasks.values()] : written;
}
