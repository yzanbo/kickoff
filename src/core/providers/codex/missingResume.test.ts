import assert from "node:assert/strict";
import { test } from "vitest";
import { StdioRpcError } from "../stdioRpc.js";
import { confirmedMissingResume } from "./turn.js";

test("Codex のセッション消失は resume の正式なエラーと対象 ID が一致するときだけ確定する", () => {
  const id = "00000000-0000-4000-8000-000000000000";
  const message = `no rollout found for thread id ${id}`;
  assert.equal(confirmedMissingResume(new StdioRpcError("thread/resume", message, -32600), id), true);
  assert.equal(confirmedMissingResume(new StdioRpcError("thread/resume", message, -32603), id), false);
  assert.equal(confirmedMissingResume(new StdioRpcError("turn/start", message, -32600), id), false);
  assert.equal(confirmedMissingResume(new StdioRpcError("thread/resume", message, -32600), "other"), false);
  assert.equal(confirmedMissingResume(new StdioRpcError("thread/resume", `failed: ${message}`, -32600), id), false);
  assert.equal(confirmedMissingResume(new Error(message), id), false);
  assert.equal(confirmedMissingResume(new StdioRpcError("thread/resume", message, -32600), null), false);
});
