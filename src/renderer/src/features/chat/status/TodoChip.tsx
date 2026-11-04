import { CheckCircle2, Circle, CircleDot, ListTodo } from "lucide-react";
import { useMemo } from "react";
import type { ChatEvent } from "@shared/types";
import { cx } from "@/lib/cx";
import { usePopover } from "@/ui/Popover";
import { ComposerChip } from "@/features/chat/composer/ComposerChip";
import { collectTodos, type TodoStatus } from "./todoList";

const STATUS_ICONS: Record<TodoStatus, typeof Circle> = { pending: Circle, in_progress: CircleDot, completed: CheckCircle2 };
const STATUS_LABELS: Record<TodoStatus, string> = { pending: "未着手", in_progress: "作業中", completed: "完了" };

/**
 * チャット欄の上の「ToDo 2/5」。エージェントが付けた作業の一覧の進み具合を出し、押すと一覧が開く。
 * 作業中のものがあれば、その作業中の言い方を添える
 */
export function TodoChip({ events }: { events: ChatEvent[] }) {
  const todos = useMemo(() => collectTodos(events), [events]);
  const popover = usePopover();
  if (todos.length === 0) return null;
  const done = todos.filter((t) => t.status === "completed").length;
  const current = todos.find((t) => t.status === "in_progress");
  return (
    <ComposerChip
      popover={popover}
      chip={
        <>
          <ListTodo size={14} className="chip-icon" aria-hidden />
          ToDo {done}/{todos.length}
          {current && <span className="chip-running todo-current"> · {current.activeForm ?? current.content}</span>}
        </>
      }
      title="ToDo の一覧"
      label="ToDo"
    >
      {todos.map((t) => {
        const Icon = STATUS_ICONS[t.status];
        return (
          <div key={t.key} className={cx("todo-row", `todo-${t.status}`)}>
            <Icon size={15} className="todo-icon" aria-label={STATUS_LABELS[t.status]} />
            <span className="todo-text">{t.status === "in_progress" ? (t.activeForm ?? t.content) : t.content}</span>
          </div>
        );
      })}
    </ComposerChip>
  );
}
