import { MoreHorizontal } from "lucide-react";
import { busyWithUnread } from "../../../../core/board";
import { AGENT_STATE_LABELS, type AgentState, type Run } from "../../../../core/types";
import { chatTitle } from "../../chatTitle";
import { cx } from "../../cx";
import { startRunDrag } from "../../groups";
import type { RunTitleEditor } from "../../hooks/useRunRename";
import { href, openRun } from "../../router";
import { formatDayTime, shortRelativeTime } from "../../time";
import { workingFor } from "../chat/activity";
import { useTicker } from "../../hooks/useTicker";
import { useRunActivity } from "../../runActivity";
import { useChatSelection } from "./chatSelection";
import { CARD_MENU_WIDTH } from "../menus/CardMenu";
import { ChatTitleInput } from "../ChatTitleInput";
import { IconButton } from "../IconButton";
import { StatusSlot } from "../StatusSlot";
import { WorktreeChip } from "../WorktreeChip";

/**
 * サイドバーのチャットの行（押すと右のパネルで開く・⌘ / Shift を押しながらで複数選ぶ・ダブルクリックで名前を変える・ドラッグでグループへ移す・
 * 右クリックか、乗せると右端に出る「…」でメニュー（複数選んでいればまとめて操作））
 */
export function ChatRow({
  run,
  state,
  active,
  menuOpen = false,
  onMenu,
  onCloseMenu,
  onRename,
  rename,
}: {
  run: Run;
  state: AgentState;
  active: boolean;
  /** この行のメニューを開いているか（「…」を出したままにし、もう一度押すと閉じる） */
  menuOpen?: boolean;
  onMenu: (at: { x: number; y: number }) => void;
  onCloseMenu?: () => void;
  /** ダブルクリックで名前をその場で変え始める */
  onRename: () => void;
  /** 名前をその場で変えている途中のとき */
  rename?: RunTitleEditor;
}) {
  // hooks は、下の早い return（名前の変更中）より前に呼ぶ
  const selection = useChatSelection();
  const selected = selection?.has(run.id) ?? false;
  // 作業中のまま、まだ見ていない返答がある（印に未読の点を重ね、名前を太字に）
  const busyUnread = busyWithUnread(run, state);
  if (rename) {
    // 押しても開かず、ドラッグもしない（入力欄の文字を選べるように）
    return (
      <li>
        <div className={cx("chat-row", "renaming", active && "active")}>
          <StatusSlot state={state} unread={busyUnread} />
          <span className="chat-row-body">
            <ChatTitleInput run={run} editor={rename} />
          </span>
        </div>
      </li>
    );
  }
  // 選んでいるチャットのメニューなら、まとめて操作するメニュー
  const openMenuAt = (at: { x: number; y: number }) => {
    if (selection && selected && selection.ids.size > 1) selection.openMenu(at);
    else onMenu(at);
  };
  return (
    <li className="chat-row-item">
      <a
        className={cx(
          "chat-row",
          run.archived_at && "archived",
          active && "active",
          selected && "multi-selected",
          (state === "needs_input" || state === "attention" || busyUnread) && "is-unread",
        )}
        data-run-id={run.id}
        aria-selected={selection && selection.ids.size > 0 ? selected : undefined}
        href={href({ name: "run", projectId: run.project_id, runId: run.id })}
        title={`${chatTitle(run.title)}（${AGENT_STATE_LABELS[state]}${busyUnread ? "・未読あり" : ""}）`}
        draggable
        onDragStart={(e) => startRunDrag(e, run.id)}
        onDoubleClick={(e) => {
          e.preventDefault();
          onRename();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenuAt({ x: e.clientX, y: e.clientY });
        }}
        onClick={(e) => {
          e.preventDefault();
          // ⌘ を押しながら: 選ぶ・外す / Shift: 前に選んだものからの範囲（どちらも開かない）
          if (selection && (e.metaKey || e.ctrlKey)) return selection.toggle(run.id);
          if (selection && e.shiftKey) return selection.range(run.id);
          selection?.clear();
          // 開いているチャットをもう一度押したときも、閉じたパネルを開き直す
          openRun(run.project_id, run.id);
        }}
      >
        <StatusSlot state={state} unread={busyUnread} />
        <span className="chat-row-body">
          <span className="chat-row-line">
            <span className="chat-row-title">{chatTitle(run.title)}</span>
            {state === "running" ? (
              <RunningTime run={run} />
            ) : (
              <span className="chat-row-time" title={formatDayTime(run.active_at)}>
                {shortRelativeTime(run.active_at)}
              </span>
            )}
          </span>
          <span className="chat-row-meta">
            <WorktreeChip run={run} />
          </span>
        </span>
      </a>
      {/* 乗せたとき・メニューを開いている間だけ出す「…」（時刻の上に重ねる）。行の中のリンクと分けて置く */}
      <span className={cx("chat-row-actions", menuOpen && "open")}>
        <IconButton
          icon={MoreHorizontal}
          size={14}
          label="メニュー"
          title="メニュー（右クリックでも開く）"
          className="chat-row-more"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            if (menuOpen) return onCloseMenu?.();
            // メニューの右端を、ボタンの右端にそろえて下に出す
            const rect = e.currentTarget.getBoundingClientRect();
            openMenuAt({ x: rect.right - CARD_MENU_WIDTH, y: rect.bottom + 4 });
          }}
        />
      </span>
    </li>
  );
}

/** 作業中のチャットの時刻の代わりに出す経過時間（「作業中 3分」）。マウスを乗せると、いまの作業（ファイルの編集・コマンドの実行など） */
function RunningTime({ run }: { run: Run }) {
  useTicker(30_000);
  const activity = useRunActivity(run.id);
  const since = run.turn_started_at ?? run.active_at;
  return (
    <span className="chat-row-time running" title={`${activity ?? "作業中"}\n始めた時刻: ${formatDayTime(since)}`}>
      {workingFor(since)}
    </span>
  );
}
