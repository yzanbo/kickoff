import { CheckCircle2, Circle, CircleDashed, CircleDot, EyeOff, ListChecks, ListTodo } from "lucide-react";
import { useMemo } from "react";
import type { ChatEvent } from "@shared/types";
import { cx } from "@/lib/cx";
import { formatMessageTime } from "@/lib/time";
import { useFold } from "@/hooks/useFold";
import { useSetting } from "@/hooks/useSetting";
import { todoHidden } from "@/lib/storageKeys";
import { FoldSection } from "@/ui/FoldHead";
import { usePopover } from "@/ui/Popover";
import { ComposerChip } from "@/features/chat/composer/ComposerChip";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { promptListOf } from "@/features/chat/prompts/promptHistory";
import { collectTodoList, todoSignature, todoVisibility, type TodoGroup, type TodoItem, type TodoStatus } from "./todoList";

const STATUS_ICONS: Record<TodoStatus, typeof Circle> = { pending: Circle, in_progress: CircleDot, completed: CheckCircle2 };
const STATUS_LABELS: Record<TodoStatus, string> = { pending: "未着手", in_progress: "作業中", completed: "完了" };

function TodoRow({ todo }: { todo: TodoItem }) {
  const Icon = STATUS_ICONS[todo.status];
  return (
    <div className={cx("todo-row", `todo-${todo.status}`)}>
      <Icon size={15} className="todo-icon" aria-label={STATUS_LABELS[todo.status]} />
      <span className="todo-text">{todo.status === "in_progress" ? (todo.activeForm ?? todo.content) : todo.content}</span>
    </div>
  );
}

/**
 * チャット欄の上の「ToDo 2/5」。エージェントが付けた作業の一覧の進み具合を出し、押すと一覧が開く。
 * 数えるのはいまの作業の ToDo だけ（長く使うチャットで、前の作業の分が溜まって数が膨らまないように。分け方は collectTodoList）。
 * 作業中のものがあれば、その作業中の言い方を添える。いまの作業がすべて完了したら「✓ ToDo 5/5」と控えめにし、次の指示を送ると
 * これまでの ToDo に移って隠れる（todoVisibility）。一覧の下に、閉じたまとまりで「前の作業から残っているもの」と「これまでの ToDo」（指示ごと。
 * 見出しを押すとその指示へ移る）。「この一覧を隠す」で手でも隠せる（チャットごとに覚え、いまの作業が書き換わったらまた出す）
 */
export function TodoChip({ chatId, events }: { chatId: number; events: ChatEvent[] }) {
  const list = useMemo(() => collectTodoList(events), [events]);
  const [hidden, setHidden] = useSetting(todoHidden(chatId));
  const popover = usePopover();
  const staleFold = useFold("composer", "todo-stale", { defaultOpen: false });
  const historyFold = useFold("composer", "todo-history", { defaultOpen: false });
  const visibility = todoVisibility(list, hidden);
  if (visibility === "hidden") return null;
  const todos = list.items;
  const done = todos.filter((t) => t.status === "completed").length;
  const current = todos.find((t) => t.status === "in_progress");
  const finished = visibility === "done";
  const historyCount = list.history.reduce((n, g) => n + g.items.length, 0);
  const sections = list.stale.length > 0 || historyCount > 0;
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
      title={finished ? "ToDo の一覧（いまの作業はすべて完了）" : "ToDo の一覧"}
      label="ToDo"
    >
      {sections && <div className="todo-section-label">いまの作業</div>}
      {todos.map((t) => (
        <TodoRow key={t.key} todo={t} />
      ))}
      {list.stale.length > 0 && (
        <FoldSection
          look="row"
          icon={CircleDashed}
          label="前の作業から残っているもの"
          count={list.stale.length}
          open={staleFold.open}
          onToggle={staleFold.toggle}
          indent={false}
          wrapClassName="composer-archived todo-fold"
          title="完了にならないまま、しばらく触られていない ToDo（AI が完了にし忘れたものが多い）。数には入れません"
        >
          {list.stale.map((t) => (
            <TodoRow key={t.key} todo={t} />
          ))}
        </FoldSection>
      )}
      {historyCount > 0 && (
        <FoldSection
          look="row"
          icon={ListChecks}
          label="これまでの ToDo"
          count={historyCount}
          open={historyFold.open}
          onToggle={historyFold.toggle}
          indent={false}
          wrapClassName="composer-archived todo-fold"
        >
          <TodoHistory groups={list.history} events={events} onJump={popover.close} />
        </FoldSection>
      )}
      <div className="todo-actions">
        <button
          type="button"
          className="link-button"
          title="この ToDo の一覧をチャット欄の上に出さない（エージェントがいまの作業の一覧を書き換えたら、また出します）"
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

/** これまでの ToDo: 付けたときの指示ごとに、指示の 1 行目と時刻を見出しにして並べる（新しい指示が先。見出しを押すとその指示へ移る） */
function TodoHistory({ groups, events, onJump }: { groups: TodoGroup[]; events: ChatEvent[]; onJump: () => void }) {
  const pane = useOptionalChatPane();
  const prompts = promptListOf(events).byId;
  return (
    <>
      {groups.map((g) => {
        const prompt = g.promptId === null ? undefined : prompts.get(g.promptId);
        const label = prompt?.label.split("\n")[0] ?? "最初の指示より前";
        return (
          <div key={g.promptId ?? "none"} className="todo-group">
            {prompt && pane ? (
              <button
                type="button"
                className="todo-group-head"
                title={`この指示へ移る: ${prompt.label}`}
                onClick={() => {
                  onJump();
                  pane.jumpTo(prompt.id);
                }}
              >
                <span className="todo-group-text">{label}</span>
                <time className="todo-group-time">{formatMessageTime(prompt.at)}</time>
              </button>
            ) : (
              <div className="todo-group-head">
                <span className="todo-group-text">{label}</span>
                {prompt && <time className="todo-group-time">{formatMessageTime(prompt.at)}</time>}
              </div>
            )}
            {g.items.map((t) => (
              <TodoRow key={t.key} todo={t} />
            ))}
          </div>
        );
      })}
    </>
  );
}
