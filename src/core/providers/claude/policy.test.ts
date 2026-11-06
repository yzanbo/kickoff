import assert from "node:assert/strict";
import { test } from "node:test";
import type { HookInput } from "@anthropic-ai/claude-agent-sdk";
import { turnContextHook } from "./policy.js";

const signal = new AbortController().signal;
const submit = { hook_event_name: "UserPromptSubmit", prompt: "質問", session_id: "s", transcript_path: "/tmp/t", cwd: "/tmp" } as HookInput;

test("指示に添える文脈: 実行の初めの指示にだけ additionalContext で添え、作業中に足した発言・ほかのフックには添えない", async () => {
  const [hook] = turnContextHook("親チャット: 「メイン」").hooks;
  const preCompact = { hook_event_name: "PreCompact", trigger: "auto", custom_instructions: null, session_id: "s", transcript_path: "/tmp/t", cwd: "/tmp" } as HookInput;
  assert.deepEqual(await hook(preCompact, undefined, { signal }), {});
  assert.deepEqual(await hook(submit, undefined, { signal }), {
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "親チャット: 「メイン」" },
  });
  assert.deepEqual(await hook(submit, undefined, { signal }), {});
});
