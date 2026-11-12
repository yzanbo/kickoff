import assert from "node:assert/strict";
import { test } from "node:test";
import type { HookInput } from "@anthropic-ai/claude-agent-sdk";
import { turnContextHook, turnHooks } from "./policy.js";
import type { ApprovalRequest, ProviderTurnParams } from "../types.js";

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

test("AI の Docker の守り: 聞くと決めた Bash は承認カードで聞き（覚えない）、許可なら流し、拒否なら理由付きで断る。聞かないものは聞かない", async () => {
  const asked: ApprovalRequest[] = [];
  let answer: "allow" | "deny" = "allow";
  const params = { dockerGuard: { check: async (cmd: string) => (cmd.includes("app-db-1") ? { title: "止めようとしています", description: "補い" } : null) } } as unknown as ProviderTurnParams;
  const cb = { requestApproval: async (req: ApprovalRequest) => (asked.push(req), answer === "allow" ? { action: "allow" as const } : { action: "deny" as const, message: "だめ" }) };
  const matcher = turnHooks(params, undefined, cb)?.PreToolUse?.[0];
  assert.equal(matcher?.matcher, "Bash");
  const [hook] = matcher?.hooks ?? [];
  const bash = (command: string) => ({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, tool_use_id: "t1", session_id: "s", transcript_path: "/tmp/t", cwd: "/tmp" }) as HookInput;
  assert.deepEqual(await hook(bash("docker ps"), undefined, { signal }), {});
  assert.equal(asked.length, 0);
  assert.deepEqual(await hook(bash("docker stop app-db-1"), undefined, { signal }), {});
  assert.deepEqual(asked[0], { kind: "permission", toolName: "Bash", input: { command: "docker stop app-db-1" }, title: "止めようとしています", description: "補い", canRemember: false, toolUseId: "t1" });
  answer = "deny";
  const denied = await hook(bash("docker stop app-db-1"), undefined, { signal });
  assert.equal((denied as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput?.permissionDecision, "deny");
  assert.match(JSON.stringify(denied), /利用者が拒否しました.*だめ/);
});
