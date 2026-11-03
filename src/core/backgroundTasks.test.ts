import assert from "node:assert/strict";
import test from "node:test";
import type { RunEvent } from "./types.js";
import { isBackgroundLaunch, unfinishedBackgroundAgents } from "./backgroundTasks.js";

let id = 0;
const ev = (type: string, data: Record<string, unknown>): RunEvent => ({ id: ++id, run_id: 1, type, data, created_at: "" }) as unknown as RunEvent;

test("裏で動かしたサブエージェントの起動の知らせを見分ける", () => {
  assert.equal(isBackgroundLaunch("Async agent launched successfully. agentId: x"), true);
  assert.equal(isBackgroundLaunch("報告の本文"), false);
  assert.equal(isBackgroundLaunch(undefined), false);
});

test("いまの作業で裏で動かし、終わりの知らせがないサブエージェントだけを返す", () => {
  const events = [
    // 前の作業のもの（数えない）
    ev("user", { text: "前" }),
    ev("tool_use", { id: "old", name: "Agent", input: { description: "前の作業" } }),
    ev("tool_result", { tool_use_id: "old", content: "Async agent launched" }),
    ev("user", { text: "いま" }),
    ev("tool_use", { id: "a", name: "Agent", input: { description: "タグ付け" } }),
    ev("tool_result", { tool_use_id: "a", content: "Async agent launched successfully." }),
    ev("tool_use", { id: "b", name: "Agent", input: { description: "音声入力" } }),
    ev("tool_result", { tool_use_id: "b", content: "Async agent launched successfully." }),
    ev("subagent", { tool_use_id: "b", status: "completed" }),
    // そのまま終わるまで待ったもの（裏で動かしていない）
    ev("tool_use", { id: "c", name: "Agent", input: { description: "前景" } }),
    ev("tool_result", { tool_use_id: "c", content: "報告" }),
  ];
  assert.deepEqual(unfinishedBackgroundAgents(events), ["タグ付け"]);
});

test("報告を渡した（SubagentHandback）サブエージェントは、終わりの知らせがなくても終わったとみなす", () => {
  const events = [
    ev("user", { text: "いま" }),
    ev("tool_use", { id: "a", name: "Agent", input: { description: "調査" } }),
    ev("tool_result", { tool_use_id: "a", content: "Async agent launched successfully." }),
    ev("tool_use", { id: "h", name: "SubagentHandback", parent: "a", input: { message: "報告" } }),
  ];
  assert.deepEqual(unfinishedBackgroundAgents(events), []);
});
