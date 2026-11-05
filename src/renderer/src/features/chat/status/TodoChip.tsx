import { CheckCircle2, Circle, CircleDot, EyeOff, ListTodo } from "lucide-react";
import { useMemo } from "react";
import type { ChatEvent } from "@shared/types";
import { cx } from "@/lib/cx";
import { useSetting } from "@/hooks/useSetting";
import { todoHidden } from "@/lib/storageKeys";
import { usePopover } from "@/ui/Popover";
import { ComposerChip } from "@/features/chat/composer/ComposerChip";
import { collectTodoList, todoSignature, todoVisibility, type TodoStatus } from "./todoList";

const STATUS_ICONS: Record<TodoStatus, typeof Circle> = { pending: Circle, in_progress: CircleDot, completed: CheckCircle2 };
const STATUS_LABELS: Record<TodoStatus, string> = { pending: "未着手", in_progress: "作業中", completed: "完了" };

/**
 * チャット欄の上の「ToDo 2/5」。エージェントが付けた作業の一覧の進み具合を出し、押すと一覧が開く。
 * 作業中のものがあれば、その作業中の言い方を添える。すべて完了したら「✓ ToDo 5/5」と控えめにし、そのあと自分が次の指示を送ったら
 * 前の作業の一覧として隠す（todoVisibility）。一覧の「この一覧を隠す」で手でも隠せる（チャットごとに覚え、一覧が書き換わったらまた出す）
 */
export function TodoChip({ chatId, events }: { chatId: number; events: ChatEvent[] }) {
  const list = useMemo(() => collectTodoList(events), [events]);
  const [hidden, setHidden] = useSetting(todoHidden(chatId));
  const popover = usePopover();
  const visibility = todoVisibility(list, events, hidden);
  if (visibility === "hidden") return null;
  const todos = list.items;
  const done = todos.filter((t) => t.status === "completed").length;
  const current = todos.find((t) => t.status === "in_progress");
  const finished = visibility === "done";
  return (
    <ComposerChip
      popover={popover}
      chip={
        <span className={cx("todo-chip", finished && "finished")}>
          {finished ? <CheckCircle2 size={14} className="chip-icon" aria-hidden /> : <ListTodo size={14} className="chip-icon" aria-hidden />}
          ToDo {done}/{todos.length}
          {current && <span className="chip-running todo-current"> · {current.activeForm ?? current.content}</span>}
        </span>
      }
      title={finished ? "ToDo の一覧（すべて完了）" : "ToDo の一覧"}
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
      <div className="todo-actions">
        <button
          type="button"
          className="link-button"
          title="この ToDo の一覧をチャット欄の上に出さない（エージェントが一覧を書き換えたら、また出します）"
          onClick={() => {
            setHidden(todoSignature(todos));
            popover.close();
          }}
        >
          <EyeOff size={13} aria-hidden />
          この一覧を隠す
        </button>
      </div>
    </ComposerChip>
  );
}
