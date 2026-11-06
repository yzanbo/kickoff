import assert from "node:assert/strict";
import { test } from "node:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createBackgroundTracker } from "./background.js";

const changed = (tasks: object[]) => ({ type: "system", subtype: "background_tasks_changed", tasks }) as unknown as SDKMessage;
const result = { type: "result", subtype: "success" } as unknown as SDKMessage;
const mainSpeaks = { type: "assistant", parent_tool_use_id: null, message: { content: [] } } as unknown as SDKMessage;
const subSpeaks = { type: "assistant", parent_tool_use_id: "tu1", message: { content: [] } } as unknown as SDKMessage;

test("裏の作業: 一覧で置き換え、返答の終わり（result）と次の返答の始まりを追う。変わらなければ知らせない", () => {
  const track = createBackgroundTracker();
  assert.deepEqual(track(changed([{ task_id: "b1", task_type: "local_bash", description: "npm run dev" }])), {
    tasks: [{ task_id: "b1", kind: "command", description: "npm run dev" }],
    replied: false,
  });
  // 同じ一覧なら知らせない
  assert.equal(track(changed([{ task_id: "b1", task_type: "local_bash", description: "npm run dev" }])), undefined);
  assert.deepEqual(track(result), { tasks: [{ task_id: "b1", kind: "command", description: "npm run dev" }], replied: true });
  // サブエージェントの発言では、メインの返答は始まらない
  assert.equal(track(subSpeaks), undefined);
  const both = track(
    changed([
      { task_id: "b1", task_type: "local_bash", description: "npm run dev" },
      { task_id: "a1", task_type: "local_agent", subagent_type: "general-purpose", description: "調査" },
      { task_id: "w1", task_type: "local_monitor", description: "見張り", ambient: true },
    ]),
  );
  assert.deepEqual(both?.tasks.map((t) => [t.task_id, t.kind]), [
    ["b1", "command"],
    ["a1", "agent"],
  ]);
  assert.equal(both?.replied, true);
  // 裏の作業が終わって、メインが次の返答を始めた
  assert.equal(track(mainSpeaks)?.replied, false);
  assert.deepEqual(track(changed([]))?.tasks, []);
});

test("裏の作業: 開始の知らせ（task_started）の呼び出しの ID を作業に添える（一覧より後に届いても）", () => {
  const track = createBackgroundTracker();
  const started = (taskId: string, toolUseId: string) =>
    ({ type: "system", subtype: "task_started", task_id: taskId, tool_use_id: toolUseId, task_type: "local_bash" }) as unknown as SDKMessage;
  // 一覧が先に届く（裏で始めた作業は、開始の知らせより先に一覧に入る）
  assert.equal(track(changed([{ task_id: "b1", task_type: "local_bash", description: "npm run dev" }]))?.tasks[0].tool_use_id, undefined);
  assert.deepEqual(track(started("b1", "tu-bash"))?.tasks, [{ task_id: "b1", kind: "command", description: "npm run dev", tool_use_id: "tu-bash" }]);
  // 同じ知らせがもう一度来ても、変わらなければ知らせない
  assert.equal(track(started("b1", "tu-bash")), undefined);
  // 一覧で置き換えても、覚えた ID を添えたまま
  assert.equal(track(changed([{ task_id: "b1", task_type: "local_bash", description: "npm run dev" }])), undefined);
  // 手前で動かしたもの（一覧にない）は、一覧を変えない
  assert.equal(track(started("f1", "tu-fore")), undefined);
  // 開始の知らせが先なら、一覧に入ったときに添える
  const next = track(changed([{ task_id: "a1", task_type: "local_agent", description: "調査" }]));
  assert.deepEqual(next?.tasks, [{ task_id: "a1", kind: "agent", description: "調査" }]);
  track(started("a2", "tu-agent"));
  assert.equal(track(changed([{ task_id: "a2", task_type: "local_agent", description: "洗い出し" }]))?.tasks[0].tool_use_id, "tu-agent");
});
