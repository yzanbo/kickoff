import assert from "node:assert/strict";
import { test } from "vitest";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { confirmedClaudeMissingResume } from "./missingResume.js";

test("Claude Code の会話消失は開始前の対象 ID の明示的な結果だけを認める", () => {
  const id = "00000000-0000-4000-8000-000000000000";
  const message = `No conversation found with session ID: ${id}`;
  const result = { type: "result", subtype: "error_during_execution", session_id: id, errors: [message] } as SDKResultMessage;
  const error = new Error(`Claude Code returned an error result: ${message}`);
  assert.equal(confirmedClaudeMissingResume(error, id, result, false), true);
  assert.equal(confirmedClaudeMissingResume(error, id, result, true), false);
  assert.equal(confirmedClaudeMissingResume(error, "other", result, false), false);
  assert.equal(confirmedClaudeMissingResume(error, id, undefined, false), false);
  assert.equal(confirmedClaudeMissingResume(new Error(message), id, result, false), false);
  assert.equal(confirmedClaudeMissingResume(error, id, { ...result, errors: [message, "別の失敗"] } as SDKResultMessage, false), false);
});
