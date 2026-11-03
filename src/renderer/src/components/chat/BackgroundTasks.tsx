import { Bot, Square, SquareTerminal } from "lucide-react";
import type { BackgroundState, BackgroundTask } from "../../../../core/types";
import { api } from "../../api";
import { confirmDialog } from "../../dialogs";
import { IconButton } from "../IconButton";
import { reportFailure } from "../../runActions";

const ICONS: Record<BackgroundTask["kind"], typeof Bot> = { agent: Bot, command: SquareTerminal, other: SquareTerminal };

/**
 * 裏で動いている作業の一覧（作業中の行の下）。1 件ずつ止められる（チャット全体は止めない。
 * 開発サーバーだけ止めて、サブエージェントは動かしたままにするなど）。サブエージェントは、止めると報告が届かないので確かめる
 */
export function BackgroundTasks({ runId, background }: { runId: number; background: BackgroundState | null }) {
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
        return (
          <li key={task.task_id} className="background-task">
            <Icon size={13} aria-hidden className="muted" />
            <span className="background-task-name" title={task.description}>
              {task.description}
            </span>
            <IconButton icon={Square} label={`「${task.description}」を止める`} title="この作業だけを止める（チャットは止めない）" size={12} onClick={() => void stop(task)} />
          </li>
        );
      })}
    </ul>
  );
}
