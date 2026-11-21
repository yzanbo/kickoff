import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import type { HookInput } from "./wire";
import { KICKOFF_DISALLOWED_TOOLS, toAllowedTools, turnContextHook, turnHooks } from "./policy";
import type { ApprovalRequest, GuardMaterials, ProviderTurnParams, SandboxPlan } from "@/features/ai/core/providers/types";
import type { PermissionMode } from "@shared/settings/types";
import { withGate } from "@/app/core/testing/testGate";
import type { ApprovalReply } from "@shared/ai/approvals";
import { tempDir } from "@/foundation/core/testing/tempDir";

const signal = new AbortController().signal;
const submit = { hook_event_name: "UserPromptSubmit", prompt: "質問", session_id: "s", transcript_path: "/tmp/t", cwd: "/tmp" } as HookInput;

test("使わせないツール: Kickoff の利用者に届かない PushNotification と、会話ごと作業場所を移す EnterWorktree / ExitWorktree を外す", () => {
  assert.deepEqual([...KICKOFF_DISALLOWED_TOOLS].sort(), ["EnterWorktree", "ExitWorktree", "PushNotification"]);
});

test("許可ルール: 承認なしのコマンドを Bash(<コマンド>:*) に写し、読む・Web はいつも承認なし、ファイルの編集は権限モードに任せる", () => {
  const rules = toAllowedTools(["git status", "npm test"]);
  assert.ok(rules.includes("Bash(git status:*)") && rules.includes("Bash(npm test:*)"));
  assert.ok(rules.includes("Read") && rules.includes("WebSearch") && rules.includes("WebFetch"));
  assert.ok(!rules.includes("Edit") && !rules.some((r) => r.startsWith("mcp__")));
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

/** 守りの材料から本物の門（guard の gate.ts）を作った実行の指定（承認カードは requestApproval で答える） */
function guarded(m: Partial<GuardMaterials> & { cwd?: string; permissionMode?: PermissionMode; sandbox?: SandboxPlan | null }, requestApproval?: (req: ApprovalRequest) => Promise<ApprovalReply>) {
  const base = { cwd: m.cwd ?? "/w", permissionMode: m.permissionMode ?? "default", sandbox: m.sandbox ?? null, sandboxOff: false } as ProviderTurnParams;
  return withGate(base, requestApproval, signal, m);
}

/** PreToolUse の守りのフック（1 つだけ） */
function guardHookOf(params: ProviderTurnParams) {
  const matchers = turnHooks(params).PreToolUse ?? [];
  assert.equal(matchers.length, 1);
  return matchers[0];
}

const decisionOf = (out: unknown) => (out as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput?.permissionDecision;

test("守りのフック: PreToolUse は matcher のない 1 つで、承認カードを待つ長さ（1 日より長く）の待ち時間を渡す", () => {
  const matcher = guardHookOf(guarded({}));
  assert.equal(matcher.matcher, undefined);
  assert.ok((matcher.timeout ?? 0) >= 24 * 60 * 60);
});

test("AI の Docker の守り: 聞くと決めた Bash は承認カードで聞き（覚えない）、許可なら流し、拒否なら理由付きで断る。聞かないものは聞かない", async () => {
  const asked: ApprovalRequest[] = [];
  let answer: "allow" | "deny" = "allow";
  const dockerGuard = { check: async (cmd: string) => (cmd.includes("app-db-1") ? { title: "止めようとしています", description: "補い" } : null) };
  const cb = async (req: ApprovalRequest): Promise<ApprovalReply> => (asked.push(req), answer === "allow" ? { action: "allow" } : { action: "deny", message: "だめ" });
  const [hook] = guardHookOf(guarded({ dockerGuard }, cb)).hooks;
  const bash = (command: string) => ({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command, description: "説明" }, tool_use_id: "t1", session_id: "s", transcript_path: "/tmp/t", cwd: "/tmp" }) as HookInput;
  assert.deepEqual(await hook(bash("docker ps"), undefined, { signal }), {});
  assert.equal(asked.length, 0);
  assert.deepEqual(await hook(bash("docker stop app-db-1"), undefined, { signal }), {});
  // カードに出す入力はコマンドだけ
  assert.deepEqual(asked[0], { kind: "permission", toolName: "Bash", input: { command: "docker stop app-db-1" }, title: "止めようとしています", description: "補い", canRemember: false, toolUseId: "t1" });
  answer = "deny";
  const denied = await hook(bash("docker stop app-db-1"), undefined, { signal });
  assert.equal(decisionOf(denied), "deny");
  assert.match(JSON.stringify(denied), /利用者が拒否しました.*だめ/);
});

test("AI の書き込み先の守り: ほかの作業場所は断り、外は承認カード（このチャットでは許可）で聞き、許したファイルはチャットの間もう聞かない", async () => {
  const root = tempDir({ real: true });
  const main = path.join(root, "app");
  const wt = path.join(root, "app-wt");
  const outside = path.join(root, "outside");
  for (const dir of [main, wt, outside]) fs.mkdirSync(dir);
  const asked: ApprovalRequest[] = [];
  let answer: ApprovalReply = { action: "allow_always" };
  const allowed = new Set<string>();
  const workplaces = async () => [
    { path: main, worktree_path: null, branch: "main" },
    { path: wt, worktree_path: wt, branch: "feat/x" },
  ];
  const params = guarded({ cwd: main, permissionMode: "auto", writeScope: { writableDirs: [], workplaces, allowed } }, async (req) => (asked.push(req), answer));
  const [hook] = guardHookOf(params).hooks;
  const write = (file: string) => ({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: file, content: "x" }, tool_use_id: "t1", session_id: "s", transcript_path: "/tmp/t", cwd: main }) as HookInput;
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

test("AI の書き込み先の守り: 計画モードでは、カードで許しても許す答えを返さず権限モードに任せる", async () => {
  const root = tempDir({ real: true });
  const params = guarded({ cwd: path.join(root, "app"), permissionMode: "plan", writeScope: { writableDirs: [], workplaces: async () => [], allowed: new Set() } }, async () => ({ action: "allow" }));
  const [hook] = guardHookOf(params).hooks;
  const write = { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: path.join(root, "outside.txt"), content: "x" }, tool_use_id: "t1", session_id: "s", transcript_path: "/tmp/t", cwd: root } as HookInput;
  assert.deepEqual(await hook(write, undefined, { signal }), {});
});

test("AI の書き込み先の守り: ほかの守りが断る場所（参照資料など）にはカードを出さない", async () => {
  const root = tempDir({ real: true });
  const ref = path.join(root, "ref");
  fs.mkdirSync(ref);
  const asked: ApprovalRequest[] = [];
  const params = guarded({ cwd: root, readOnlyPaths: [ref], writeScope: { writableDirs: [], workplaces: async () => [], allowed: new Set() } }, async (req) => (asked.push(req), { action: "allow" }));
  const [hook] = guardHookOf(params).hooks;
  const input = { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: path.join(ref, "a.md") }, tool_use_id: "t1", session_id: "s", transcript_path: "/tmp/t", cwd: root } as HookInput;
  assert.equal(decisionOf(await hook(input, undefined, { signal })), "deny");
  assert.equal(asked.length, 0);
});

test("砂場で止まったときの文: 失敗で終わった Bash の結果に断られた場所と代わりの道を添える。成功したコマンドの出力には足さない。砂場がなければフックを付けない", async () => {
  const root = tempDir({ real: true });
  const sandbox = { writableDirs: [root], readOnlyDirs: [], unsandboxedCommands: [], proxyPort: null };
  const hooks = turnHooks(guarded({ cwd: root, writeScope: { writableDirs: [], workplaces: async () => [], allowed: new Set() }, sandbox }));
  const base = { tool_name: "Bash", tool_input: { command: "touch ~/a" }, tool_use_id: "t1", session_id: "s", transcript_path: "/tmp/t", cwd: root };
  const failed = await hooks.PostToolUseFailure?.[0]?.hooks[0]({ ...base, hook_event_name: "PostToolUseFailure", error: "(eval):1: operation not permitted: /Users/nobody/b" } as HookInput, undefined, { signal });
  assert.match(JSON.stringify(failed), /"hookEventName":"PostToolUseFailure".*Kickoff の砂場が.*\/Users\/nobody\/b: 書ける場所の外です/);
  // 成功したコマンド（ソース・ログ・テストを読んだだけ）の出力に OS の文の形があっても、砂場が断ったとは限らないので足さない
  const read = { ...base, tool_input: { command: "cat sandboxDenied.test.ts" } };
  const success = { ...read, hook_event_name: "PostToolUse", tool_response: { stdout: "touch: /Users/nobody/a: Operation not permitted", stderr: "", interrupted: false } } as HookInput;
  const outs = await Promise.all((hooks.PostToolUse ?? []).map((m) => m.hooks[0](success, undefined, { signal })));
  assert.ok(outs.every((o) => !JSON.stringify(o).includes("Kickoff の砂場")));
  // 断られていなければ何も足さない
  const quiet = await hooks.PostToolUseFailure?.[0]?.hooks[0]({ ...base, hook_event_name: "PostToolUseFailure", error: "Exit code 1" } as HookInput, undefined, { signal });
  assert.deepEqual(quiet, {});
  assert.equal(turnHooks(guarded({ cwd: root })).PostToolUseFailure, undefined);
});

test("git のフックを飛ばす Bash は、ほかの守りがなくてもいつも断る", async () => {
  const [hook] = guardHookOf(guarded({})).hooks;
  const bash = (command: string) => ({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, tool_use_id: "t1", session_id: "s", transcript_path: "/tmp/t", cwd: "/w" }) as HookInput;
  const run = (command: string) => hook(bash(command), undefined, { signal });
  assert.match(JSON.stringify(await run('git commit --no-verify -m "x"')), /"permissionDecision":"deny".*フック/);
  assert.doesNotMatch(JSON.stringify(await run('git commit -m "x"')), /deny/);
  // NODE_COMPILE_CACHE を設定するコマンドも、ほかの守りがなくても断る
  assert.match(JSON.stringify(await run("open -a Kickoff --env NODE_COMPILE_CACHE=/tmp/c")), /"permissionDecision":"deny".*NODE_COMPILE_CACHE/);
  assert.doesNotMatch(JSON.stringify(await run("echo $NODE_COMPILE_CACHE")), /deny/);
});
