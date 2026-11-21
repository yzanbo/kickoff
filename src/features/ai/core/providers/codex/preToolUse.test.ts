// Codex の PreToolUse フックの判定（preToolUse.ts）と、砂場から出る承認の頼み（approvals.ts）
import { test } from "vitest";
import assert from "node:assert/strict";
import type { ApprovalReply } from "@shared/ai/approvals";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { PLAN_MODE_DECLINED } from "@/features/ai/core/permissionMode";
import { withGate } from "@/app/core/testing/testGate";
import type { ApprovalRequest, ProviderTurnParams } from "@/features/ai/core/providers/types";
import { createApprovalHandler } from "./approvals";
import { hookDeny } from "./hooks";
import { createPreToolUseHandler, writeKey } from "./preToolUse";
import { SANDBOX_EXIT_DECLINED } from "./sandboxExit";

function setup(extra: Partial<ProviderTurnParams>, answer: (req: ApprovalRequest) => ApprovalReply = () => ({ action: "allow" })) {
  const events: any[] = [];
  const approvals: ApprovalRequest[] = [];
  const steers: string[] = [];
  const approvedWrites = new Set<string>();
  const cb = {
    emit: (e: any) => events.push(e),
    requestApproval: async (req: ApprovalRequest) => {
      approvals.push(req);
      return answer(req);
    },
  };
  const params = withGate({ cwd: tempDir({ real: true }), permissionMode: "default", deleteGuard: true, ...extra } as ProviderTurnParams, cb.requestApproval);
  const signal = new AbortController().signal;
  const hook = createPreToolUseHandler({ params, cb, approvedWrites });
  const approve = createApprovalHandler({ params, cb, signal, items: new Map(), steer: (t) => steers.push(t), approvedWrites });
  return { params, hook, approve, events, approvals, steers, approvedWrites };
}

const bash = (command: string) => ({ tool_name: "Bash", tool_use_id: "exec-1", tool_input: { command } });
const patch = (...files: string[]) => ({ tool_name: "apply_patch", tool_use_id: "exec-2", tool_input: { command: ["*** Begin Patch", ...files.map((f) => `*** Add File: ${f}\n+x`), "*** End Patch"].join("\n") } });

test("フック: 断る守りは聞かずに断り、止めた呼び出しと理由を記録に残す", async () => {
  const s = setup({ permissionMode: "auto" });
  const answer = (await s.hook(bash("rm -rf build"))) as ReturnType<typeof hookDeny>;
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /kickoff-trash/);
  assert.equal(s.approvals.length, 0);
  assert.deepEqual(s.events[0], { type: "tool_use", id: "exec-1", name: "Bash", input: { command: "rm -rf build" } });
  assert.equal(s.events[1].type, "tool_result");
  assert.equal(s.events[1].is_error, true);
});

test("フック: 権限モード（Auto mode と計画モードのコマンドは何も言わない・毎回確認は聞く・計画モードのファイルの変更は断る）", async () => {
  assert.equal(await setup({ permissionMode: "auto" }).hook(bash("npm test")), null);
  assert.equal(await setup({ permissionMode: "plan" }).hook(bash("cat a.ts")), null);
  assert.deepEqual(await setup({ permissionMode: "plan" }).hook(patch("a.txt")), hookDeny(PLAN_MODE_DECLINED));

  const s = setup({ permissionMode: "default" }, () => ({ action: "deny", message: "今はやめて" }));
  const answer = (await s.hook(bash("npm install"))) as ReturnType<typeof hookDeny>;
  assert.deepEqual(s.approvals[0].input, { command: "npm install" });
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /今はやめて/);
  assert.equal(await setup({ permissionMode: "acceptEdits" }).hook(patch("a.txt")), null);
});

test("フック: 作業場所の外へのファイルの変更は Auto mode でも聞き、許した書く先はあとのファイルの変更の承認で聞き直さない", async () => {
  const outside = "/opt/kickoff-test-nowhere/x.txt";
  const s = setup({ permissionMode: "auto", writeScope: { writableDirs: [], workplaces: async () => [], allowed: new Set() } });
  assert.equal(await s.hook(patch(outside)), null);
  assert.equal(s.approvals.length, 1);
  assert.ok(s.approvedWrites.has(writeKey(s.params.cwd, outside)));
  const items = new Map([["exec-2", { type: "fileChange", id: "exec-2", changes: [{ path: outside, kind: { type: "add" }, diff: "+x" }], status: "inProgress" }]]);
  const approve = createApprovalHandler({ params: s.params, cb: { requestApproval: async () => ({ action: "deny" }) }, signal: new AbortController().signal, items: items as never, steer: () => {}, approvedWrites: s.approvedWrites });
  assert.deepEqual(await approve("item/fileChange/requestApproval", { threadId: "t", turnId: "u", itemId: "exec-2", reason: null, grantRoot: null }), { decision: "accept" });
});

test("砂場から出るコマンドの頼み: Bash の砂場をかけていれば、決まったコマンドだけ通し、ほかは理由を伝えて断る", async () => {
  const sandbox = { writableDirs: [], readOnlyDirs: [], unsandboxedCommands: ["brew install:*"], proxyPort: null };
  const s = setup({ permissionMode: "auto", bashSandbox: sandbox });
  const ask = (command: string) => s.approve("item/commandExecution/requestApproval", { threadId: "t", turnId: "u", itemId: "c", command });
  assert.deepEqual(await ask("/bin/zsh -lc 'brew install ffmpeg'"), { decision: "accept" });
  assert.deepEqual(await ask("/bin/zsh -lc 'touch ~/x'"), { decision: "decline" });
  assert.match(s.steers[0], new RegExp(SANDBOX_EXIT_DECLINED.slice(0, 20)));
  // 計画モードは断る
  const plan = setup({ permissionMode: "plan", bashSandbox: sandbox });
  assert.deepEqual(await plan.approve("item/commandExecution/requestApproval", { threadId: "t", turnId: "u", itemId: "c", command: "brew install x" }), { decision: "decline" });
});
