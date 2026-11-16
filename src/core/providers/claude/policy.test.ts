import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import type { HookInput } from "@anthropic-ai/claude-agent-sdk";
import { KICKOFF_DISALLOWED_TOOLS, turnContextHook, turnHooks } from "./policy.js";
import type { ApprovalRequest, ProviderTurnParams } from "../types.js";
import type { ApprovalDecision } from "@shared/types";
import { tempDir } from "../../testing/tempDir.js";

const signal = new AbortController().signal;
const submit = { hook_event_name: "UserPromptSubmit", prompt: "質問", session_id: "s", transcript_path: "/tmp/t", cwd: "/tmp" } as HookInput;

test("使わせないツール: Kickoff の利用者に届かない PushNotification と、会話ごと作業場所を移す EnterWorktree / ExitWorktree を外す", () => {
  assert.deepEqual([...KICKOFF_DISALLOWED_TOOLS].sort(), ["EnterWorktree", "ExitWorktree", "PushNotification"]);
});

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
  // Docker の守りは、書き込み先の守りがなければ最後のフック
  const matcher = turnHooks(params, undefined, cb)?.PreToolUse?.at(-1);
  assert.equal(matcher?.matcher, "Bash");
  // 既定の待ち時間で承認カードが閉じないよう、1 日より長く待つ
  assert.ok((matcher?.timeout ?? 0) >= 24 * 60 * 60);
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

test("AI の書き込み先の守り: ほかの作業場所は断り、外は承認カード（このチャットでは許可）で聞き、許したファイルはチャットの間もう聞かない", async () => {
  const root = tempDir({ real: true });
  const main = path.join(root, "app");
  const wt = path.join(root, "app-wt");
  const outside = path.join(root, "outside");
  for (const dir of [main, wt, outside]) fs.mkdirSync(dir);
  const asked: ApprovalRequest[] = [];
  let answer: ApprovalDecision = { action: "allow_always" };
  const allowed = new Set<string>();
  const params = {
    cwd: main,
    permissionMode: "auto",
    writeScope: {
      writableDirs: [],
      workplaces: async () => [
        { path: main, worktree_path: null, branch: "main" },
        { path: wt, worktree_path: wt, branch: "feat/x" },
      ],
      allowed,
    },
  } as unknown as ProviderTurnParams;
  const cb = { requestApproval: async (req: ApprovalRequest) => (asked.push(req), answer) };
  const matcher = turnHooks(params, undefined, cb)?.PreToolUse?.at(-1);
  assert.equal(matcher?.matcher, "Write|Edit|MultiEdit|NotebookEdit");
  assert.ok((matcher?.timeout ?? 0) >= 24 * 60 * 60);
  const [hook] = matcher?.hooks ?? [];
  const write = (file: string) => ({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: file, content: "x" }, tool_use_id: "t1", session_id: "s", transcript_path: "/tmp/t", cwd: main }) as HookInput;
  const decisionOf = (out: unknown) => (out as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput?.permissionDecision;
  // 自分の作業場所は何も言わない（権限モードに任せる）
  assert.deepEqual(await hook(write(path.join(main, "a.ts")), undefined, { signal }), {});
  // ほかの作業場所は聞かずに断る
  const denied = await hook(write(path.join(wt, "a.ts")), undefined, { signal });
  assert.equal(decisionOf(denied), "deny");
  assert.match(JSON.stringify(denied), /利用者に「そのワークツリー/);
  assert.equal(asked.length, 0);
  // 外は「このチャットでは許可」付きのカードで聞き、許したら流す
  const file = path.join(outside, "rc");
  assert.equal(decisionOf(await hook(write(file), undefined, { signal })), "allow");
  assert.equal(asked.length, 1);
  assert.equal(asked[0].canRemember, true);
  assert.equal(asked[0].rememberScope, "chat");
  assert.ok(allowed.has(file));
  // 同じファイルはもう聞かない。別のファイルはまた聞き、断られたら理由付きで断る
  assert.equal(decisionOf(await hook(write(file), undefined, { signal })), "allow");
  assert.equal(asked.length, 1);
  answer = { action: "deny", message: "だめ" };
  const refused = await hook(write(path.join(outside, "other")), undefined, { signal });
  assert.equal(decisionOf(refused), "deny");
  assert.match(JSON.stringify(refused), /利用者が拒否しました.*だめ/);
  assert.equal(asked.length, 2);
});

test("AI の書き込み先の守り: ほかの守りが断る場所（参照資料など）にはカードを出さない", async () => {
  const root = tempDir({ real: true });
  const ref = path.join(root, "ref");
  fs.mkdirSync(ref);
  const asked: ApprovalRequest[] = [];
  const params = { cwd: root, readOnlyPaths: [ref], writeScope: { writableDirs: [], workplaces: async () => [], allowed: new Set() } } as unknown as ProviderTurnParams;
  const hooks = turnHooks(params, undefined, { requestApproval: async (req) => (asked.push(req), { action: "allow" }) })?.PreToolUse ?? [];
  const input = { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: path.join(ref, "a.md") }, tool_use_id: "t1", session_id: "s", transcript_path: "/tmp/t", cwd: root } as HookInput;
  const outs = await Promise.all(hooks.map((m) => m.hooks[0](input, undefined, { signal })));
  assert.ok(outs.some((o) => JSON.stringify(o).includes("deny")));
  assert.equal(asked.length, 0);
});

test("砂場で止まったときの文: Bash の結果（成功・失敗とも）に断られた場所と代わりの道を添える。砂場がなければフックを付けない", async () => {
  const root = tempDir({ real: true });
  const sandbox = { writableDirs: [root], readOnlyDirs: [], unsandboxedCommands: [], proxyPort: null };
  const params = { cwd: root, writeScope: { writableDirs: [], workplaces: async () => [], allowed: new Set() }, bashSandbox: sandbox } as unknown as ProviderTurnParams;
  const hooks = turnHooks(params, undefined, { requestApproval: async () => ({ action: "allow" }) });
  const base = { tool_name: "Bash", tool_input: { command: "touch ~/a" }, tool_use_id: "t1", session_id: "s", transcript_path: "/tmp/t", cwd: root };
  const ok = await hooks?.PostToolUse?.[0]?.hooks[0]({ ...base, hook_event_name: "PostToolUse", tool_response: { stdout: "", stderr: "touch: /Users/nobody/a: Operation not permitted" } } as HookInput, undefined, { signal });
  assert.match(JSON.stringify(ok), /Kickoff の砂場が.*書ける場所の外です/);
  const failed = await hooks?.PostToolUseFailure?.[0]?.hooks[0]({ ...base, hook_event_name: "PostToolUseFailure", error: "(eval):1: operation not permitted: /Users/nobody/b" } as HookInput, undefined, { signal });
  assert.match(JSON.stringify(failed), /"hookEventName":"PostToolUseFailure".*\/Users\/nobody\/b/);
  // 断られていなければ何も足さない
  const quiet = await hooks?.PostToolUse?.[0]?.hooks[0]({ ...base, hook_event_name: "PostToolUse", tool_response: { stdout: "ok", stderr: "" } } as HookInput, undefined, { signal });
  assert.deepEqual(quiet, {});
  assert.equal(turnHooks({ cwd: root } as unknown as ProviderTurnParams, undefined, { requestApproval: async () => ({ action: "allow" }) })?.PostToolUse, undefined);
});

test("git のフックを飛ばす Bash は、ほかの守りがなくてもいつも断る", async () => {
  const hooks = turnHooks({ cwd: "/w" } as unknown as ProviderTurnParams, undefined, { requestApproval: async () => ({ action: "allow" }) })?.PreToolUse ?? [];
  const bash = (command: string) => ({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, tool_use_id: "t1", session_id: "s", transcript_path: "/tmp/t", cwd: "/w" }) as HookInput;
  const run = (command: string) => Promise.all(hooks.map((m) => m.hooks[0](bash(command), undefined, { signal })));
  assert.match(JSON.stringify(await run('git commit --no-verify -m "x"')), /"permissionDecision":"deny".*フック/);
  assert.doesNotMatch(JSON.stringify(await run('git commit -m "x"')), /deny/);
  // NODE_COMPILE_CACHE を設定するコマンドも、ほかの守りがなくても断る
  assert.match(JSON.stringify(await run("open -a Kickoff --env NODE_COMPILE_CACHE=/tmp/c")), /"permissionDecision":"deny".*NODE_COMPILE_CACHE/);
  assert.doesNotMatch(JSON.stringify(await run("echo $NODE_COMPILE_CACHE")), /deny/);
});
