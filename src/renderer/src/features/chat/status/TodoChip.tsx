import { CheckCircle2, Circle, CircleDashed, CircleDot, EyeOff, ListChecks, ListTodo, MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import type { ChatEvent } from "@shared/types";
import { cx } from "@/lib/cx";
import { formatMessageTime } from "@/lib/time";
import { useFold } from "@/hooks/useFold";
import { useSetting } from "@/hooks/useSetting";
import { todoHidden } from "@/lib/storageKeys";
import { FoldSection } from "@/ui/FoldHead";
import { Chevron } from "@/ui/Chevron";
import { Collapse } from "@/ui/Collapse";
import { IconButton } from "@/ui/IconButton";
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
 * これまでの ToDo に移って隠れる（todoVisibility）。一覧の下に、閉じたまとまりで「前の作業から残っているもの」と「これまでの ToDo」（指示ごとに
 * 開閉できるまとまり。TodoHistory）。「この一覧を隠す」で手でも隠せる（チャットごとに覚え、いまの作業が書き換わったらまた出す）
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
          count={list.history.length}
          title={`これまでに完了した ToDo ${historyCount} 件を、付けたときの指示ごとにまとめています（件数は指示の数）`}
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

/**
 * これまでの ToDo: 付けたときの指示ごとのまとまり（新しい指示が先）を、開閉できる見出しで並べる（前は見出しの細い 1 行と中身をすべて開いたまま並べていて、
 * 長く使うチャットでは 1 本の長い一覧に見えた）。初めはいちばん新しいまとまりだけを開き、ほかは見出し（指示の 1 行目・件数・時刻）だけの履歴にする。
 * 開閉は一覧を開いている間だけ覚える（保存しない）。見出しの右の吹き出しでその指示へ移る
 */
function TodoHistory({ groups, events, onJump }: { groups: TodoGroup[]; events: ChatEvent[]; onJump: () => void }) {
  const pane = useOptionalChatPane();
  const prompts = promptListOf(events).byId;
  const [open, setOpen] = useState<ReadonlySet<number | null>>(() => new Set(groups.slice(0, 1).map((g) => g.promptId)));
  const toggle = (id: number | null) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <>
      {groups.map((g) => {
        const prompt = g.promptId === null ? undefined : prompts.get(g.promptId);
        const label = prompt?.label.split("\n")[0] ?? "最初の指示より前";
        const isOpen = open.has(g.promptId);
        return (
          <div key={g.promptId ?? "none"} className={cx("todo-group", isOpen && "open")}>
            <div className="todo-group-head">
              <button
                type="button"
                className="todo-group-toggle"
                aria-expanded={isOpen}
                title={prompt ? `${isOpen ? "たたむ" : "開く"}: ${prompt.label}` : undefined}
                onClick={() => toggle(g.promptId)}
              >
                <Chevron open={isOpen} />
                <span className="todo-group-text">{label}</span>
                <span className="todo-group-count">{g.items.length}</span>
                {prompt && <time className="todo-group-time">{formatMessageTime(prompt.at)}</time>}
              </button>
              {prompt && pane && (
                <IconButton
                  icon={MessageSquare}
                  size={13}
                  className="todo-group-jump"
                  label="この指示へ移る"
                  onClick={() => {
                    onJump();
                    pane.jumpTo(prompt.id);
                  }}
                />
              )}
            </div>
            <Collapse open={isOpen}>
              <div className="todo-group-items">
                {g.items.map((t) => (
                  <TodoRow key={t.key} todo={t} />
                ))}
              </div>
            </Collapse>
          </div>
        );
      })}
    </>
  );
}
