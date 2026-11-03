import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { BackgroundState, BackgroundTask } from "../types.js";

/** Claude Code のタスクの種類を、画面に出す種類にする */
function kindOf(taskType: string): BackgroundTask["kind"] {
  if (taskType === "local_agent") return "agent";
  if (taskType === "local_bash") return "command";
  return "other";
}

/**
 * 裏で動いている作業と、メインの返答が終わったかを追う（Claude Code の SDK のメッセージから）。
 * 裏の作業は background_tasks_changed（いま動いているものの一覧。来るたびに丸ごと置き換える）で決め、
 * 開始・終了の知らせの組み合わせには頼らない（1 つ取りこぼしても、実行中のまま固まらない）。
 * 返答は result で書き終わり、メインのエージェントの次の発言で再び書き始めたとみなす
 * （裏の作業が終わると、Claude Code が自動で次の返答を始める）。
 * 変わったときだけ、新しい様子を返す（変わらなければ undefined）
 */
export function createBackgroundTracker() {
  let state: BackgroundState = { tasks: [], replied: false };
  const update = (next: BackgroundState) => {
    const same =
      next.replied === state.replied &&
      next.tasks.length === state.tasks.length &&
      next.tasks.every((t, i) => t.task_id === state.tasks[i].task_id && t.description === state.tasks[i].description);
    state = next;
    return same ? undefined : next;
  };
  return (msg: SDKMessage): BackgroundState | undefined => {
    if (msg.type === "system" && msg.subtype === "background_tasks_changed") {
      const tasks = msg.tasks
        // 動きでないもの（見張りなど）は数えない
        .filter((t) => !(t as { ambient?: boolean }).ambient)
        .map((t): BackgroundTask => ({
          task_id: t.task_id,
          kind: kindOf(t.task_type),
          description: t.description,
          ...(t.subagent_type ? { subagent_type: t.subagent_type } : {}),
        }));
      return update({ ...state, tasks });
    }
    if (msg.type === "result") return update({ ...state, replied: true });
    if (msg.type === "assistant" && msg.parent_tool_use_id === null && state.replied) return update({ ...state, replied: false });
    return undefined;
  };
}
