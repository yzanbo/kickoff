import assert from "node:assert/strict";
import { test } from "node:test";
import type { SubagentEntry } from "./subagents";
import { subagentState } from "./subagentState";

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
