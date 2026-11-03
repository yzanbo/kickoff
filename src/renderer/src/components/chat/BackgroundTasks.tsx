import { Bot, Square, SquareTerminal } from "lucide-react";
import type { SubagentEntry } from "../../../../core/subagents";
import type { BackgroundState, BackgroundTask } from "../../../../core/types";
import { api } from "../../api";
import { confirmDialog } from "../../dialogs";
import { IconButton } from "../IconButton";
import { reportFailure } from "../../runActions";
import { ActivityNote } from "./Subagents";

const ICONS: Record<BackgroundTask["kind"], typeof Bot> = { agent: Bot, command: SquareTerminal, other: SquareTerminal };

/**
 * 裏で動いている作業の一覧（作業中の行の下）。1 件ずつ止められる（チャット全体は止めない。
 * 開発サーバーだけ止めて、サブエージェントは動かしたままにするなど）。サブエージェントは、止めると報告が届かないので確かめる。
 * サブエージェントは名前を押すと中身をタブで開き、しばらく動きがなければ最後の動き（長く動きがなければ注意の色）を添える
 */
export function BackgroundTasks({
  runId,
  background,
  agents = [],
  onOpen,
}: {
  runId: number;
  background: BackgroundState | null;
  agents?: SubagentEntry[];
  onOpen?: (entry: SubagentEntry) => void;
}) {
  if (!background || background.tasks.length === 0) return null;
  const stop = async (task: BackgroundTask) => {
    if (
      task.kind === "agent" &&
      !(await confirmDialog({
        title: `サブエージェント「${task.description}」を止めます`,
        message: "止めると、このサブエージェントの報告は届きません。ほかの作業とチャットは止まりません。",
        confirmLabel: "止める",
        danger: true,
      }))
    )
      return;
    await api.stopBackgroundTask(runId, task.task_id).catch(reportFailure("裏の作業を止められませんでした"));
  };
  return (
    <ul className="background-tasks" aria-label="裏で動いている作業">
      {background.tasks.map((task) => {
        const Icon = ICONS[task.kind];
        // サブエージェントの一覧の行（作業 ID で結びつける）
        const entry = task.kind === "agent" ? agents.find((s) => s.agentId === task.task_id) : undefined;
        return (
          <li key={task.task_id} className="background-task">
            <Icon size={13} aria-hidden className="muted" />
            {entry && onOpen ? (
              <button type="button" className="link-button background-task-name" title={`「${task.description}」の中身を開く`} onClick={() => onOpen(entry)}>
                {task.description}
              </button>
            ) : (
              <span className="background-task-name" title={task.description}>
                {task.description}
              </span>
            )}
            {entry && <ActivityNote entry={entry} />}
            <IconButton icon={Square} label={`「${task.description}」を止める`} title="この作業だけを止める（チャットは止めない）" size={12} onClick={() => void stop(task)} />
          </li>
        );
      })}
    </ul>
  );
}
