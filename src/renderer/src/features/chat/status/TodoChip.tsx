import { CheckCircle2, ChevronUp, Circle, CircleDot, ListTodo } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { RunEvent } from "@shared/types";
import { cx } from "@/lib/cx";
import { useDismiss } from "@/hooks/useDismiss";
import { collectTodos, type TodoStatus } from "./todoList";

const STATUS_ICONS: Record<TodoStatus, typeof Circle> = { pending: Circle, in_progress: CircleDot, completed: CheckCircle2 };
const STATUS_LABELS: Record<TodoStatus, string> = { pending: "未着手", in_progress: "作業中", completed: "完了" };

/**
 * チャット欄の上の「ToDo 2/5」。エージェントが付けた作業の一覧の進み具合を出し、押すと一覧が開く。
 * 作業中のものがあれば、その作業中の言い方を添える
 */
export function TodoChip({ events }: { events: RunEvent[] }) {
  const todos = useMemo(() => collectTodos(events), [events]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, () => setOpen(false), { enabled: open });
  if (todos.length === 0) return null;
  const done = todos.filter((t) => t.status === "completed").length;
  const current = todos.find((t) => t.status === "in_progress");
  return (
    <div ref={ref} className="chip-wrap">
      <button type="button" className={cx("composer-chip", open && "open")} aria-expanded={open} title="ToDo の一覧" onClick={() => setOpen(!open)}>
        <ListTodo size={14} className="chip-icon" aria-hidden />
        ToDo {done}/{todos.length}
        {current && <span className="chip-running todo-current"> · {current.activeForm ?? current.content}</span>}
        <ChevronUp size={13} className="chip-chevron" aria-hidden />
      </button>
      {open && (
        <div className="chip-popover" role="dialog" aria-label="ToDo">
          {todos.map((t) => {
            const Icon = STATUS_ICONS[t.status];
            return (
              <div key={t.key} className={cx("todo-row", `todo-${t.status}`)}>
                <Icon size={15} className="todo-icon" aria-label={STATUS_LABELS[t.status]} />
                <span className="todo-text">{t.status === "in_progress" ? (t.activeForm ?? t.content) : t.content}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
