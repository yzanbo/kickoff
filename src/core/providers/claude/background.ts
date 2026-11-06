import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { BackgroundState, BackgroundTask } from "@shared/types";

/** 覚えておく、作業 ID と起動した呼び出しの ID の組の数 */
const MAX_CALLS = 200;

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
 * 作業を起動した呼び出しの ID（tool_use_id）は一覧に載らないので、開始の知らせ（task_started）で作業 ID ごとに覚えて添える
 * （画面が、裏で動かしたコマンドの呼び出しを、終わるまで流れの中でも実行中として見せるため）。
 * 変わったときだけ、新しい様子を返す（変わらなければ undefined）
 */
export function createBackgroundTracker() {
  let state: BackgroundState = { tasks: [], replied: false };
  // 作業 ID → 起動した呼び出しの ID（開始の知らせが一覧より後に届いても添えられるよう、一覧の作り直しでも使う）
  const callOf = new Map<string, string>();
  const withCall = (t: BackgroundTask): BackgroundTask => {
    const call = callOf.get(t.task_id);
    return call && t.tool_use_id !== call ? { ...t, tool_use_id: call } : t;
  };
  const update = (next: BackgroundState) => {
    const same =
      next.replied === state.replied &&
      next.tasks.length === state.tasks.length &&
      next.tasks.every((t, i) => {
        const prev = state.tasks[i];
        return t.task_id === prev.task_id && t.description === prev.description && t.tool_use_id === prev.tool_use_id;
      });
    state = next;
    return same ? undefined : next;
  };
  return (msg: SDKMessage): BackgroundState | undefined => {
    if (msg.type === "system" && msg.subtype === "background_tasks_changed") {
      const tasks = msg.tasks
        // 動きでないもの（見張りなど）は数えない
        .filter((t) => !(t as { ambient?: boolean }).ambient)
        .map((t): BackgroundTask =>
          withCall({
            task_id: t.task_id,
            kind: kindOf(t.task_type),
            description: t.description,
            ...(t.subagent_type ? { subagent_type: t.subagent_type } : {}),
          }),
        );
      return update({ ...state, tasks });
    }
    if (msg.type === "system" && msg.subtype === "task_started") {
      if (!msg.tool_use_id) return undefined;
      callOf.set(msg.task_id, msg.tool_use_id);
      // 手前で動かして一覧に載らないものも覚えるので、古いものから捨てる（手前で始めてから裏に回るサブエージェントがあるため、一覧から外れても忘れない）
      if (callOf.size > MAX_CALLS) callOf.delete(callOf.keys().next().value!);
      return update({ ...state, tasks: state.tasks.map(withCall) });
    }
    if (msg.type === "result") return update({ ...state, replied: true });
    if (msg.type === "assistant" && msg.parent_tool_use_id === null && state.replied) return update({ ...state, replied: false });
    return undefined;
  };
}
