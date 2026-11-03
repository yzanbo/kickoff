import assert from "node:assert/strict";
import { test } from "node:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createBackgroundTracker } from "./claudeBackground.js";

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
