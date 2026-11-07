import assert from "node:assert/strict";
import { test } from "node:test";
import { eventSequence } from "@shared/testing/factories";
import type { SubagentEntry } from "./subagents";
import { subagentState, waitingSubagentKeys } from "./subagentState";

const entry = (patch: Partial<SubagentEntry>): SubagentEntry => ({ key: "a", description: "調査", status: "completed", ...patch });

test("subagentState: チャットと同じ 5 つの状態と、添える細かい様子", () => {
  assert.deepEqual(subagentState(entry({ status: "running" })), { state: "running", detail: null });
  assert.deepEqual(subagentState(entry({ delivery: "received" })), { state: "read", detail: null });
  assert.deepEqual(subagentState(entry({})), { state: "read", detail: null });
  assert.deepEqual(subagentState(entry({ delivery: "pending" })), { state: "read", detail: "awaiting" });
  assert.deepEqual(subagentState(entry({ delivery: "lost" })), { state: "failed", detail: "undelivered" });
  assert.deepEqual(subagentState(entry({ status: "failed" })), { state: "failed", detail: null });
  assert.deepEqual(subagentState(entry({ status: "failed", outputLimit: true })), { state: "failed", detail: "output_limit" });
  assert.deepEqual(subagentState(entry({ status: "failed", network: true })), { state: "failed", detail: "network" });
  assert.deepEqual(subagentState(entry({ status: "stopped", network: true })), { state: "failed", detail: "network" });
  assert.deepEqual(subagentState(entry({ status: "stopped" })), { state: "read", detail: "stopped" });
});

test("subagentState: 親がやり直したものは手を打たなくてよいので既読、回答待ちはほかより先", () => {
  const superseded = { key: "b", description: "やり直し" };
  assert.deepEqual(subagentState(entry({ status: "failed", network: true, supersededBy: superseded })), { state: "read", detail: "superseded" });
  assert.deepEqual(subagentState(entry({ status: "running" }), true), { state: "needs_input", detail: null });
});

test("waitingSubagentKeys: 依頼の呼び出しの記録の parent（再開した回の ID も）から引き、記録になければサブエージェントの ID で引く", () => {
  const ev = eventSequence();
  const events = [
    ev("tool_use", { id: "m1", name: "Bash", input: {} }),
    ev("tool_use", { id: "s1", name: "Bash", input: {}, parent: "a" }),
    ev("tool_use", { id: "s2", name: "Edit", input: {}, parent: "resume-b" }),
  ];
  const entries = [entry({ key: "a", status: "running" }), entry({ key: "b", status: "running", aliases: ["resume-b"] }), entry({ key: "c", status: "running", agentId: "deep1" })];
  const ask = (tool_use_id?: string, agent_id?: string, kind: "permission" | "question" | "reconnect" = "permission") => ({ kind, tool_use_id, agent_id });
  assert.deepEqual([...waitingSubagentKeys([ask("s1"), ask("s2")], events, entries)].sort(), ["a", "b"]);
  // 記録にない（深い入れ子）ものはサブエージェントの ID で
  assert.deepEqual([...waitingSubagentKeys([ask("zz", "deep1", "question")], events, entries)], ["c"]);
  // メインエージェントの依頼・再開の確かめ・分からないものは数えない
  assert.deepEqual([...waitingSubagentKeys([ask("m1"), ask("s1", undefined, "reconnect"), ask("nope")], events, entries)], []);
});
