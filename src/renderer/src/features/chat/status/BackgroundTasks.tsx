import { Bot, Square, SquareTerminal } from "lucide-react";
import type { SubagentEntry } from "@shared/chat/subagents";
import type { BackgroundState, BackgroundTask, ChatEvent } from "@shared/types";
import { api } from "@/api";
import { confirmDialog, reportFailure } from "@/ui/dialogs";
import { IconButton } from "@/ui/IconButton";
import { ActivityNote } from "@/features/chat/subagents/SubagentChip";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { useTaskOutput } from "@/features/chat/tools/commandOutputs";
import { backgroundCallTarget } from "./backgroundTarget";

const ICONS: Record<BackgroundTask["kind"], typeof Bot> = { agent: Bot, command: SquareTerminal, other: SquareTerminal };

/**
 * 裏で動いている作業の一覧（作業中の行の下）。1 件ずつ止められる（チャット全体は止めない。
 * 開発サーバーだけ止めて、サブエージェントは動かしたままにするなど）。サブエージェントは、止めると報告が届かないので確かめる。
 * サブエージェントは名前を押すと中身をタブで開き、しばらく動きがなければ最後の動き（長く動きがなければ注意の色）を添える。
 * コマンドは、出力の最後の 1 行を添え（乗せると最後の数行）、名前を押すと流れの中のそのコマンドの行（実行中の回る印と、下に流れる出力）へ移る
 * （サブエージェントの中で動かしたものは、そのサブエージェントを設定の開き方で開いてその行へ）。events: 移る先を探す会話の記録（押したときだけ探す）
 */
export function BackgroundTasks({
  chatId,
  background,
  agents = [],
  events = [],
}: {
  chatId: number;
  background: BackgroundState | null;
  agents?: SubagentEntry[];
  events?: ChatEvent[];
}) {
  // サブエージェントの中身を開く（チャットの画面の中だけ）
  const pane = useOptionalChatPane();
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
    await api.stopBackgroundTask(chatId, task.task_id).catch(reportFailure("裏の作業を止められませんでした"));
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
            {entry && pane ? (
              <button type="button" className="link-button background-task-name" title={`「${task.description}」を開く（設定の開き方で、流れの中のカードか右の欄）`} onClick={() => pane.openSubagent(entry.key)}>
                {task.description}
              </button>
            ) : task.kind !== "agent" && task.tool_use_id && pane ? (
              <button
                type="button"
                className="link-button background-task-name"
                title={`「${task.description}」の、流れの中の行へ移る（実行中の様子と出力）`}
                onClick={() => {
                  const target = backgroundCallTarget(task, events, agents);
                  if (target) pane.revealInConversation(target.eventId, target.agent);
                }}
              >
                {task.description}
              </button>
            ) : (
              <span className="background-task-name" title={task.description}>
                {task.description}
              </span>
            )}
            {entry && <ActivityNote entry={entry} />}
            {task.kind === "command" && <TaskOutputLine taskId={task.task_id} />}
            <IconButton icon={Square} label={`「${task.description}」を止める`} title="この作業だけを止める（チャットは止めない）" size={12} onClick={() => void stop(task)} />
          </li>
        );
      })}
    </ul>
  );
}

/** 裏で動いているコマンドの出力の、空でない最後の 1 行（乗せると最後の 10 行） */
function TaskOutputLine({ taskId }: { taskId: string }) {
  const text = useTaskOutput(taskId);
  const lines = text?.split("\n").filter((l) => l.trim() !== "") ?? [];
  if (lines.length === 0) return null;
  return (
    <span className="background-task-output" title={lines.slice(-10).join("\n")}>
      {lines.at(-1)}
    </span>
  );
}
