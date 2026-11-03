import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunEvent } from "../../../../core/types.js";
import { cleanSubagentReport, collectSubagents, subagentReport } from "./subagentList.js";

const ev = (id: number, type: RunEvent["type"], data: object): RunEvent =>
  ({ id, run_id: 1, type, data, created_at: "2026-11-01T00:00:00Z" }) as unknown as RunEvent;

test("サブエージェント: 呼び出し・通知・途中経過をまとめ、止まったものは中断にする", () => {
  const events = [
    ev(1, "tool_use", { id: "tu1", name: "Agent", input: { description: "レビュー A", subagent_type: "general-purpose", model: "sonnet" } }),
    ev(2, "tool_use", { id: "tu2", name: "Task", input: { description: "調査 B" } }),
    ev(3, "subagent", { task_id: "t1", tool_use_id: "tu1", description: "", status: "completed", tokens: 78800 }),
    ev(4, "tool_result", { tool_use_id: "tu1", content: "ok", is_error: false }),
    ev(5, "tool_use", { id: "tu3", name: "Read", input: {} }),
  ];
  const running = collectSubagents(events, { tu2: { task_id: "t2", tool_use_id: "tu2", description: "調査 B", status: "running", tokens: 1200, last_tool: "Grep" } }, true);
  assert.equal(running.length, 2);
  assert.deepEqual(
    running.map((s) => [s.description, s.status, s.tokens, s.model ?? null, s.lastTool ?? null]),
    [
      ["レビュー A", "completed", 78800, "sonnet", null],
      ["調査 B", "running", 1200, null, "Grep"],
    ],
  );
  assert.equal(running[0].toolUseEventId, 1);

  const stopped = collectSubagents(events, {}, false);
  assert.equal(stopped[1].status, "stopped");
});

test("サブエージェント: 以前の記録に残った、裏で動かしたコマンド（Bash）のタスクは出さない", () => {
  const events = [
    ev(1, "tool_use", { id: "bash1", name: "Bash", input: { command: "npm run dev", run_in_background: true } }),
    ev(2, "subagent", { task_id: "b1", tool_use_id: "bash1", description: "開発版を起動する", status: "running" }),
    ev(3, "subagent", { task_id: "b1", tool_use_id: "bash1", description: "", status: "failed" }),
    ev(4, "tool_use", { id: "tu1", name: "Agent", input: { description: "調査" } }),
    ev(5, "subagent", { task_id: "a1", tool_use_id: "tu1", description: "", status: "completed" }),
  ];
  assert.deepEqual(
    collectSubagents(events, {}, false).map((s) => [s.key, s.status]),
    [["tu1", "completed"]],
  );
});

test("サブエージェントの報告: 前置きと字下げを外す", () => {
  const raw =
    "  <tools-used-before-summary>Glob</tools-used-before-summary>\n  \n[Subagent hand-back] The text below is ... The report follows:\n  ありませんでした。\n  \n  ファイルは変更していません。";
  assert.equal(cleanSubagentReport(raw), "ありませんでした。\n\nファイルは変更していません。");
  assert.equal(cleanSubagentReport("そのままの報告"), "そのままの報告");
});

test("裏で動かしたサブエージェントは、起動の知らせでは完了にせず、作業が止まっていれば中断にする", () => {
  const events = [
    { id: 1, run_id: 1, type: "tool_use", data: { id: "a", name: "Agent", input: { description: "裏の作業" } }, created_at: "" },
    { id: 2, run_id: 1, type: "tool_result", data: { tool_use_id: "a", is_error: false, content: "Async agent launched successfully." }, created_at: "" },
  ] as unknown as Parameters<typeof collectSubagents>[0];
  assert.equal(collectSubagents(events, {}, true)[0].status, "running");
  assert.equal(collectSubagents(events, {}, false)[0].status, "stopped");
});

test("サブエージェント: SendMessage で再開した回は、作業 ID で元の行にまとめ、作業中に戻して最新の報告に置き換える", () => {
  const events = [
    ev(1, "tool_use", { id: "tu1", name: "Agent", input: { description: "調べもの" } }),
    ev(2, "subagent", { task_id: "a1", tool_use_id: "tu1", description: "調べもの", status: "running" }),
    ev(3, "tool_result", { tool_use_id: "tu1", is_error: false, content: "Async agent launched successfully.\nagentId: a1 (internal ID)" }),
    ev(4, "subagent", { task_id: "a1", tool_use_id: "tu1", description: "", status: "completed", summary: "1 回目の報告" }),
    ev(5, "tool_use", { id: "sm1", name: "SendMessage", input: { to: "a1" } }),
    ev(6, "subagent", { task_id: "a1", tool_use_id: "sm1", description: "調べもの", status: "running" }),
  ];
  const resumed = collectSubagents(events, {}, true);
  assert.deepEqual(resumed.map((s) => [s.key, s.description, s.status, s.agentId, s.summary]), [["tu1", "調べもの", "running", "a1", "1 回目の報告"]]);
  // 途中経過は作業 ID で届く（呼び出し ID は SendMessage のもの）
  const withProgress = collectSubagents(events, { a1: { task_id: "a1", tool_use_id: "sm1", description: "", status: "running", tokens: 500, last_tool: "Bash" } }, true);
  assert.deepEqual([withProgress[0].tokens, withProgress[0].lastTool], [500, "Bash"]);
  const done = collectSubagents([...events, ev(7, "subagent", { task_id: "a1", tool_use_id: "sm1", description: "", status: "completed", summary: "2 回目の報告" })], {}, false);
  assert.deepEqual(done.map((s) => [s.status, s.summary]), [["completed", "2 回目の報告"]]);
});

test("サブエージェントの報告: SubagentHandback の本文 → 終わりの知らせの要約 → ツールの結果の順に探す", () => {
  const base = [
    ev(1, "tool_use", { id: "tu1", name: "Agent", input: { description: "調べもの" } }),
    ev(2, "tool_result", { tool_use_id: "tu1", is_error: false, content: "ツールの結果の報告" }),
  ];
  const entry = (summary?: string) => ({ key: "tu1", description: "調べもの", status: "completed" as const, summary });
  assert.equal(subagentReport(entry(), base), "ツールの結果の報告");
  assert.equal(subagentReport(entry("要約の報告"), base), "要約の報告");
  // 要約が「別の知らせで届けた」という案内なら使わない
  const pointer = "This agent's report was delivered to you as a message from \"a1\" (its SubagentHandback call).";
  assert.equal(subagentReport(entry(pointer), [ev(1, "tool_use", { id: "tu1", name: "Agent", input: {} })]), undefined);
  const handbacks = [
    ...base,
    ev(3, "tool_use", { id: "h1", name: "SubagentHandback", parent: "tu1", input: { message: "1 回目" } }),
    ev(4, "tool_use", { id: "h2", name: "SubagentHandback", parent: "tu1", input: { message: "2 回目" } }),
  ];
  assert.equal(subagentReport(entry(pointer), handbacks), "2 回目");
});
