import { AGENT_STATE_LABELS, type AgentState, type Run } from "../../../../core/types";
import { chatTitle } from "../../chatTitle";
import { cx } from "../../cx";
import { startRunDrag } from "../../groups";
import type { RunTitleEditor } from "../../hooks/useRunRename";
import { href, openRun } from "../../router";
import { SECTION_META } from "../../sections";
import { relativeTime } from "../../time";
import { ChatTitleInput } from "../ChatTitleInput";
import { StatusSlot } from "../StatusSlot";

/** サイドバーのチャットの行（押すと右のパネルで開く・ドラッグでグループへ移す・右クリックでメニュー） */
export function ChatRow({
  run,
  state,
  active,
  onMenu,
  rename,
}: {
  run: Run;
  state: AgentState;
  active: boolean;
  onMenu: (at: { x: number; y: number }) => void;
  /** 名前をその場で変えている途中のとき */
  rename?: RunTitleEditor;
}) {
  const meta = SECTION_META[run.phase];
  const Icon = meta.icon;
  if (rename) {
    // 押しても開かず、ドラッグもしない（入力欄の文字を選べるように）
    return (
      <li>
        <div className={cx("chat-row", "renaming", active && "active")}>
          <StatusSlot state={state} />
          <span className="chat-row-body">
            <ChatTitleInput run={run} editor={rename} />
          </span>
        </div>
      </li>
    );
  }
  return (
    <li>
      <a
        className={cx("chat-row", run.archived_at && "archived", active && "active", (state === "needs_input" || state === "attention") && "is-unread")}
        href={href({ name: "run", projectId: run.project_id, runId: run.id })}
        title={`${meta.label}: ${run.title}（${AGENT_STATE_LABELS[state]}）`}
        draggable
        onDragStart={(e) => startRunDrag(e, run.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu({ x: e.clientX, y: e.clientY });
        }}
        onClick={(e) => {
          // 開いているチャットをもう一度押したときも、閉じたパネルを開き直す
          e.preventDefault();
          openRun(run.project_id, run.id);
        }}
      >
        <StatusSlot state={state} />
        <span className="chat-row-body">
          <span className="chat-row-line">
            <span className="chat-row-title">{chatTitle(run.title)}</span>
            <span className="chat-row-time">{relativeTime(run.updated_at)}</span>
          </span>
          <span className="chat-row-meta">
            <Icon size={11} className={`sec-icon sec-${run.phase}`} aria-hidden />
            {meta.label}
          </span>
        </span>
      </a>
    </li>
  );
}
