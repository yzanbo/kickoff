// ToDo の状態（TodoWrite・TaskCreate・TaskUpdate の status）と表示名（ToDo の一覧とツールの行の文が同じものを使う）

export const TODO_STATUSES = ["pending", "in_progress", "completed"] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

/** 状態の表示名（TaskUpdate の deleted も。ツールの行の「→ 完了」など） */
export const TODO_STATUS_LABELS: Record<TodoStatus | "deleted", string> = {
  pending: "未着手",
  in_progress: "作業中",
  completed: "完了",
  deleted: "削除",
};

/** 記録の status を ToDo の状態に（知らない値は未着手） */
export const todoStatusOf = (value: unknown): TodoStatus => (TODO_STATUSES as readonly unknown[]).includes(value) ? (value as TodoStatus) : "pending";
