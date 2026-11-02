import { Archive, ArchiveRestore, Pin, PinOff, Trash2 } from "lucide-react";
import { AGENT_STATE_LABELS, type AgentState, type Run } from "../../../../core/types";
import { chatTitle } from "../../chatTitle";
import { cx } from "../../cx";
import { startRunDrag } from "../../groups";
import type { RunTitleEditor } from "../../hooks/useRunRename";
import { href, openRun } from "../../router";
import { SECTION_META } from "../../sections";
import { formatDayTime, shortRelativeTime } from "../../time";
import { workingFor } from "../../activity";
import { useTicker } from "../../hooks/useTicker";
import { useRunActivity } from "../../runActivity";
import { useChatSelection } from "./chatSelection";
import { alertDialog } from "../../dialogs";
import { errorMessage } from "../../errors";
import { confirmDeleteRun, toggleArchiveRun, togglePinRun } from "../../runActions";
import { ChatTitleInput } from "../ChatTitleInput";
import { IconButton } from "../IconButton";
import { StatusSlot } from "../StatusSlot";
import { WorktreeChip } from "../WorktreeChip";

/**
 * サイドバーのチャットの行（押すと右のパネルで開く・⌘ / Shift を押しながらで複数選ぶ・ダブルクリックで名前を変える・ドラッグでグループへ移す・
 * 右クリックでメニュー（複数選んでいればまとめて操作）。乗せると右端に固定・アーカイブ・削除）
 */
export function ChatRow({
  run,
  state,
  active,
  onMenu,
  onRename,
  rename,
}: {
  run: Run;
  state: AgentState;
  active: boolean;
  onMenu: (at: { x: number; y: number }) => void;
  /** ダブルクリックで名前をその場で変え始める */
  onRename: () => void;
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
  const selection = useChatSelection();
  const selected = selection?.has(run.id) ?? false;
  const act = (fn: () => Promise<unknown>) => void fn().catch((e: unknown) => alertDialog("操作できませんでした", errorMessage(e)));
  return (
    <li className="chat-row-item">
      <a
        className={cx(
          "chat-row",
          run.archived_at && "archived",
          active && "active",
          selected && "multi-selected",
          (state === "needs_input" || state === "attention") && "is-unread",
        )}
        data-run-id={run.id}
        aria-selected={selection && selection.ids.size > 0 ? selected : undefined}
        href={href({ name: "run", projectId: run.project_id, runId: run.id })}
        title={`${meta.label}: ${run.title}（${AGENT_STATE_LABELS[state]}）`}
        draggable
        onDragStart={(e) => startRunDrag(e, run.id)}
        onDoubleClick={(e) => {
          e.preventDefault();
          onRename();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          // 選んでいるチャットを右クリックしたら、まとめて操作するメニュー
          if (selection && selected && selection.ids.size > 1) selection.openMenu({ x: e.clientX, y: e.clientY });
          else onMenu({ x: e.clientX, y: e.clientY });
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
        <StatusSlot state={state} />
        <span className="chat-row-body">
          <span className="chat-row-line">
            <span className="chat-row-title">{chatTitle(run.title)}</span>
            {state === "running" ? (
              <RunningTime run={run} />
            ) : (
              <span className="chat-row-time" title={formatDayTime(run.updated_at)}>
                {shortRelativeTime(run.updated_at)}
              </span>
            )}
          </span>
          <span className="chat-row-meta">
            <Icon size={11} className={`sec-icon sec-${run.phase}`} aria-hidden />
            {meta.label}
            <WorktreeChip run={run} />
          </span>
        </span>
      </a>
      {/* 乗せたときだけ出す（時刻の上に重ねる）。行の中のリンクと分けて置く */}
      <span className="chat-row-actions">
        {!run.archived_at && (
          <IconButton icon={run.pinned ? PinOff : Pin} size={13} label={run.pinned ? "固定をやめる" : "上に固定"} onClick={() => act(() => togglePinRun(run))} />
        )}
        <IconButton
          icon={run.archived_at ? ArchiveRestore : Archive}
          size={13}
          label={run.archived_at ? "アーカイブから戻す" : "アーカイブ"}
          onClick={() => act(() => toggleArchiveRun(run))}
        />
        <IconButton icon={Trash2} size={13} label="削除" title="削除…" className="danger" onClick={() => act(() => confirmDeleteRun(run))} />
      </span>
    </li>
  );
}

/** 作業中のチャットの時刻の代わりに出す経過時間（「作業中 3分」）。マウスを乗せると、いまの作業（ファイルの編集・コマンドの実行など） */
function RunningTime({ run }: { run: Run }) {
  useTicker(30_000);
  const activity = useRunActivity(run.id);
  const since = run.turn_started_at ?? run.updated_at;
  return (
    <span className="chat-row-time running" title={`${activity ?? "作業中"}\n始めた時刻: ${formatDayTime(since)}`}>
      {workingFor(since)}
    </span>
  );
}
