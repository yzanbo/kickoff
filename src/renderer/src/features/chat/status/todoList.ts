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

/** いまの ToDo と、最後に一覧が変わった記録の ID（まだ一覧がなければ null） */
export interface TodoList {
  items: TodoItem[];
  changedAt: number | null;
}

/** いまの ToDo（collectTodoList の一覧だけ） */
export const collectTodos = (events: ChatEvent[]): TodoItem[] => collectTodoList(events).items;

/**
 * メインのエージェントのツールの呼び出しから、いまの ToDo を組み立てる。
 * TodoWrite は毎回すべてを書き直す（最後のものが今の一覧）。TaskCreate は 1 件ずつ足し（番号は結果の「Task #3」から）、
 * TaskUpdate は番号で状態を変える（deleted は消す）。TodoWrite と Task の両方があれば、後に使った方を見る
 */
export function collectTodoList(events: ChatEvent[]): TodoList {
  let written: TodoItem[] = [];
  let writtenAt: number | null = null;
  let taskAt: number | null = null;
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
        taskAt = e.id;
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
      writtenAt = e.id;
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
      taskAt = e.id;
    }
  }
  return last === "task" ? { items: [...tasks.values()], changedAt: taskAt } : { items: written, changedAt: writtenAt };
}

/** 一覧の中身の印（手で隠した一覧と同じかを見分ける。中身・状態が変わったら別の印になり、また出す） */
export const todoSignature = (items: readonly TodoItem[]): string => items.map((t) => `${t.key}\t${t.status}\t${t.content}`).join("\n");

/**
 * ToDo のピルの出し方: full = ふつう / done = すべて完了（控えめに）/ hidden = 出さない。
 * 一覧がない・手で隠した一覧のまま（hidden が今の印と同じ）・すべて完了したあとに自分が次の指示を送った（前の作業の一覧）なら出さない
 */
export function todoVisibility(list: TodoList, events: readonly ChatEvent[], hidden: string): "full" | "done" | "hidden" {
  if (list.items.length === 0) return "hidden";
  if (hidden !== "" && hidden === todoSignature(list.items)) return "hidden";
  if (!list.items.every((t) => t.status === "completed")) return "full";
  const after = list.changedAt ?? -1;
  return events.some((e) => e.type === "user" && e.id > after) ? "hidden" : "done";
}
