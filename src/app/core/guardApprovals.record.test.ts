// 聞いてくる CLI（Codex・Copilot・ACP）の承認と守りの網: 頼みの種類 × 権限モード × 利用者の答えごとに、CLI への答え・出した承認カード・
// AI に伝えた断る理由・覚えた書く先を test-records/core/guard-approvals.json に残す（守りを門に乗せる作り直しの前後で同じ答えにする）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import type { ApprovalDecision } from "@shared/chat/approvalTypes";
import { PERMISSION_MODES, type PermissionMode } from "@shared/settings/types";
import type { ApprovalRequest, ProviderTurnParams } from "@/features/ai/core/providers/types";
import { createApprovalHandler } from "@/features/ai/core/providers/codex/approvals";
import { createPreToolUseHandler } from "@/features/ai/core/providers/codex/preToolUse";
import { createPermissionHandler, createPreToolUseHook } from "@/features/ai/core/providers/copilot/permissions";
import type { PermissionRequest } from "@/features/ai/core/providers/copilot/sdk";
import { answerPermission } from "@/features/ai/core/providers/acp/permissions";
import type { RequestPermissionRequest, ToolCall } from "@/features/ai/core/providers/acp/protocol";
import { cursorExtension } from "@/features/ai/core/providers/cursor/extensions";
import { MACOS_SELF_GUARD } from "@/features/guard/core/macosRules";
import type { SelfInfo } from "@/features/guard/core/guard/selfProtection";
import { maskVolatile, matchRecord } from "@/foundation/core/testing/record";
import { tempDir } from "@/foundation/core/testing/tempDir";

const home = os.homedir();
const DATA = `${home}/Library/Application Support/Kickoff`;
const self: SelfInfo = { pids: [4242], dataDir: DATA, port: 4317, appName: "Kickoff", guard: MACOS_SELF_GUARD, appBundle: "/Applications/Kickoff.app" };

/** 利用者の答え（承認カードに） */
const ANSWERS: Record<string, ApprovalDecision> = { allow: { action: "allow" }, always: { action: "allow_always" }, deny: { action: "deny", message: "今はだめ" } };

/** 作業場所・参照資料・作業場所の外 */
function world() {
  const root = tempDir({ real: true });
  const cwd = path.join(root, "work");
  const ref = path.join(root, "ref");
  fs.mkdirSync(cwd);
  fs.mkdirSync(ref);
  return { root, cwd, ref, inside: path.join(cwd, "a.ts"), outside: path.join(root, "outside.txt"), refFile: path.join(ref, "a.md") };
}
type World = ReturnType<typeof world>;

/** 1 つの場合の実行の材料（守りの材料・承認カードの答え）と、起きたことの控え */
function harness(w: World, mode: PermissionMode, answer: ApprovalDecision, sandbox: boolean) {
  const asked: string[] = [];
  const notes: string[] = [];
  const allowed = new Set<string>();
  const params = {
    cwd: w.cwd,
    permissionMode: mode,
    readOnlyPaths: [w.ref],
    deleteGuard: true,
    dockerGuard: { check: async (c: string) => (c.includes("down") ? { title: "ほかの作業場所の Docker を止めます", description: "本体の db" } : null) },
    writeScope: { writableDirs: [], workplaces: async () => [{ path: w.cwd, worktree_path: null, branch: "main" }], allowed },
    bashSandbox: sandbox ? { writableDirs: [w.cwd], readOnlyDirs: [], unsandboxedCommands: ["docker:*"], proxyPort: null } : null,
    tools: [{ name: "kickoff_chat", url: "http://x", headers: {}, autoAllow: ["read_chat"] }],
  } as unknown as ProviderTurnParams;
  const requestApproval = async (r: ApprovalRequest) => {
    asked.push([r.kind, r.toolName, r.title ?? "", r.canRemember ? `remember:${r.rememberScope ?? "rule"}` : "", JSON.stringify(r.input)].filter(Boolean).join(" | "));
    return answer;
  };
  const base = { params, guard: { params, self }, cb: { requestApproval, emit: (e: unknown) => notes.push(`emit ${JSON.stringify(e)}`) }, signal: new AbortController().signal };
  const result = (out: unknown, approved?: Set<string>) => ({ out, asked, notes, ...(approved?.size ? { approved: [...approved] } : {}), ...(allowed.size ? { allowed: [...allowed] } : {}) });
  return { base, notes, result };
}

type Case = (w: World, h: ReturnType<typeof harness>) => Promise<unknown>;

/** 場合ごとに、権限モード × 答えで流した結果（答えによらない場合は 1 つにまとめる） */
async function sweep(cases: Record<string, Case>, sandbox = false): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {};
  const w = world();
  for (const [name, run] of Object.entries(cases)) {
    const rows: Record<string, unknown> = {};
    for (const mode of PERMISSION_MODES) {
      const byAnswer: Record<string, string> = {};
      for (const [label, answer] of Object.entries(ANSWERS)) byAnswer[label] = JSON.stringify(await run(w, harness(w, mode, answer, sandbox)));
      const same = new Set(Object.values(byAnswer)).size === 1;
      rows[mode] = same ? JSON.parse(byAnswer.allow) : Object.fromEntries(Object.entries(byAnswer).map(([k, v]) => [k, JSON.parse(v)]));
    }
    out[name] = rows;
  }
  return out;
}

const codexApproval = (method: string, params: (w: World) => unknown, items: (w: World) => Array<[string, unknown]> = () => [], approved: (w: World) => string[] = () => []): Case => async (w, h) => {
  const approvedWrites = new Set(approved(w));
  const handler = createApprovalHandler({ ...h.base, items: new Map(items(w)) as never, steer: (t) => h.notes.push(`steer ${t}`), approvedWrites });
  return h.result(await handler(method, params(w)), approvedWrites);
};
const cmd = (command: string) => () => ({ threadId: "t", turnId: "u", itemId: "i1", command, reason: "理由" });
const change = (...paths: Array<(w: World) => string>) => (w: World): Array<[string, unknown]> => [["i1", { type: "fileChange", id: "i1", status: "x", changes: paths.map((p) => ({ path: p(w), kind: { type: "update", move_path: null }, diff: "" })) }]];

const codexHook = (tool: string, command: (w: World) => string): Case => async (w, h) => {
  const approvedWrites = new Set<string>();
  const handler = createPreToolUseHandler({ ...h.base, approvedWrites });
  return h.result(await handler({ tool_name: tool, tool_use_id: "c1", tool_input: { command: command(w) } }), approvedWrites);
};
const patch = (...paths: Array<(w: World) => string>) => (w: World) => ["*** Begin Patch", ...paths.map((p) => `*** Update File: ${p(w)}`), "*** End Patch"].join("\n");

const copilot = (req: (w: World) => unknown): Case => async (w, h) => h.result(await createPermissionHandler(h.base)(req(w) as PermissionRequest));
const copilotHook = (command: string): Case => async (_w, h) => h.result((await createPreToolUseHook(h.base)({ toolName: "bash", toolArgs: { command } } as never, {} as never)) ?? null);

const OPTIONS: RequestPermissionRequest["options"] = [
  { optionId: "o1", name: "一度だけ", kind: "allow_once" },
  { optionId: "o2", name: "常に", kind: "allow_always" },
  { optionId: "o3", name: "断る", kind: "reject_once" },
];
const acp = (call: (w: World) => ToolCall): Case => async (w, h) =>
  h.result(await answerPermission({ ...h.base, tools: h.base.params.tools ?? [], denied: (n) => h.notes.push(`denied ${n}`) }, { sessionId: "s", toolCall: call(w), options: OPTIONS }));

const inside = (w: World) => w.inside;
const outside = (w: World) => w.outside;
const refFile = (w: World) => w.refFile;

test("Codex: 承認の頼み（砂場の外のコマンド・ファイルの変更・書けるフォルダ・確かめ）と PreToolUse のフック", async () => {
  const approvals = {
    "コマンド npm test": codexApproval("item/commandExecution/requestApproval", cmd("npm test")),
    "コマンド rm -rf dist": codexApproval("item/commandExecution/requestApproval", cmd("rm -rf dist")),
    "コマンド docker compose down": codexApproval("item/commandExecution/requestApproval", cmd("docker compose down")),
    "変更 作業場所の中": codexApproval("item/fileChange/requestApproval", () => ({ threadId: "t", turnId: "u", itemId: "i1" }), change(inside)),
    "変更 作業場所の外": codexApproval("item/fileChange/requestApproval", () => ({ threadId: "t", turnId: "u", itemId: "i1" }), change(outside)),
    "変更 参照資料と中": codexApproval("item/fileChange/requestApproval", () => ({ threadId: "t", turnId: "u", itemId: "i1" }), change(inside, refFile)),
    "変更 ファイルが分からない": codexApproval("item/fileChange/requestApproval", () => ({ threadId: "t", turnId: "u", itemId: "i9" })),
    "変更 フックで許した書く先": codexApproval("item/fileChange/requestApproval", () => ({ threadId: "t", turnId: "u", itemId: "i1" }), change(outside), (w) => [w.outside]),
    "書けるフォルダ 外": codexApproval("item/permissions/requestApproval", (w) => ({ threadId: "t", turnId: "u", itemId: "i1", cwd: w.cwd, reason: null, permissions: { network: null, fileSystem: { read: null, write: [w.root] } } })),
    "書けるフォルダ 参照資料": codexApproval("item/permissions/requestApproval", (w) => ({ threadId: "t", turnId: "u", itemId: "i1", cwd: w.cwd, reason: null, permissions: { network: null, fileSystem: { read: null, write: [w.ref] } } })),
    ネットワーク: codexApproval("item/permissions/requestApproval", (w) => ({ threadId: "t", turnId: "u", itemId: "i1", cwd: w.cwd, reason: null, permissions: { network: { enabled: true }, fileSystem: null } })),
    確かめ: codexApproval("mcpServer/elicitation/request", () => ({ threadId: "t", turnId: null, serverName: "s", mode: "form", message: "使ってよいですか" })),
    古い形: codexApproval("applyPatchApproval", () => ({})),
  };
  const sandboxed = {
    "砂場 コマンド npm test": codexApproval("item/commandExecution/requestApproval", cmd("npm test")),
    "砂場 コマンド docker ps": codexApproval("item/commandExecution/requestApproval", cmd("docker ps")),
    "砂場 コマンド rm -rf dist": codexApproval("item/commandExecution/requestApproval", cmd("rm -rf dist")),
  };
  const hooks = {
    "Bash npm test": codexHook("Bash", () => "npm test"),
    "Bash rm -rf dist": codexHook("Bash", () => "rm -rf dist"),
    "Bash docker compose down": codexHook("Bash", () => "docker compose down"),
    "Bash 自分のポート": codexHook("Bash", () => "curl localhost:4317/api/status"),
    "パッチ 中": codexHook("apply_patch", patch(inside)),
    "パッチ 外": codexHook("apply_patch", patch(outside)),
    "パッチ 参照資料": codexHook("apply_patch", patch(refFile)),
    "パッチ 中と外": codexHook("apply_patch", patch(inside, outside)),
    "パッチ ファイルなし": codexHook("apply_patch", () => "*** Begin Patch\n*** End Patch"),
  };
  const record = { approvals: await sweep(approvals), sandboxed: await sweep(sandboxed, true), hooks: await sweep(hooks) };
  await matchRecord("core/guard-approvals.codex.json", maskVolatile(record, { paths: { HOME: home } }));
});

test("Copilot・ACP・Cursor: 承認の頼みとツールの前のフック", async () => {
  const copilotCases = {
    "shell npm test": copilot(() => ({ kind: "shell", toolCallId: "c1", fullCommandText: "npm test", intention: "テスト" })),
    "shell rm -rf dist": copilot(() => ({ kind: "shell", toolCallId: "c1", fullCommandText: "rm -rf dist" })),
    "shell docker compose down": copilot(() => ({ kind: "shell", toolCallId: "c1", fullCommandText: "docker compose down" })),
    "shell 砂場の外": copilot(() => ({ kind: "shell", toolCallId: "c1", fullCommandText: "npm test", requestSandboxBypass: true })),
    "write 中（新しい中身）": copilot((w) => ({ kind: "write", toolCallId: "c1", fileName: "a.ts", resolvedPath: w.inside, newFileContents: "x" })),
    "write 外（差分）": copilot((w) => ({ kind: "write", toolCallId: "c1", fileName: w.outside, diff: "-a\n+b" })),
    "write 参照資料": copilot((w) => ({ kind: "write", toolCallId: "c1", fileName: w.refFile })),
    "read 自分の保存先": copilot(() => ({ kind: "read", toolCallId: "c1", path: `${DATA}/kickoff.db` })),
    "read 中": copilot((w) => ({ kind: "read", toolCallId: "c1", path: w.inside })),
    "mcp 聞かないツール": copilot(() => ({ kind: "mcp", toolCallId: "c1", serverName: "kickoff_chat", toolName: "read_chat", args: {} })),
    "mcp 聞くツール": copilot(() => ({ kind: "mcp", toolCallId: "c1", serverName: "kickoff_chat", toolName: "create_chat", args: { text: "x" }, toolTitle: "チャットを作る" })),
    url: copilot(() => ({ kind: "url", toolCallId: "c1", url: "https://example.com" })),
    知らない種類: copilot(() => ({ kind: "custom-tool", toolCallId: "c1" })),
    "フック rm -rf dist": copilotHook("rm -rf dist"),
    "フック docker compose down": copilotHook("docker compose down"),
    "フック npm test": copilotHook("npm test"),
  };
  const acpCases = {
    "execute npm test": acp(() => ({ toolCallId: "a1", kind: "execute", title: "npm test", rawInput: { command: "npm test" } })),
    "execute rm -rf dist": acp(() => ({ toolCallId: "a1", kind: "execute", rawInput: { command: ["rm", "-rf", "dist"] } })),
    "execute docker compose down": acp(() => ({ toolCallId: "a1", kind: "execute", rawInput: { command: "docker compose down" } })),
    "read 自分の保存先": acp(() => ({ toolCallId: "a1", kind: "read", locations: [{ path: `${DATA}/kickoff.db` }] })),
    "read 中": acp((w) => ({ toolCallId: "a1", kind: "read", locations: [{ path: w.inside }] })),
    "edit 中": acp((w) => ({ toolCallId: "a1", kind: "edit", content: [{ type: "diff", path: w.inside, oldText: "a", newText: "b" }] }) as ToolCall),
    "edit 外": acp((w) => ({ toolCallId: "a1", kind: "edit", rawInput: { file_path: w.outside } })),
    "delete 参照資料": acp((w) => ({ toolCallId: "a1", kind: "delete", rawInput: { path: w.refFile } })),
    "edit ファイルなし": acp(() => ({ toolCallId: "a1", kind: "edit" })),
    "mcp 聞かないツール": acp(() => ({ toolCallId: "a1", title: "mcp__kickoff_chat__read_chat", rawInput: {} })),
    "mcp 聞くツール": acp(() => ({ toolCallId: "a1", title: "mcp__kickoff_chat__create_chat", rawInput: { text: "x" } })),
    知らない種類: acp(() => ({ toolCallId: "a1", kind: "other", title: "何か" })),
  };
  const cursorCases = {
    計画: (async (_w, h) => h.result(await cursorExtension("cursor/create_plan", { toolCallId: "p1", name: "移す", plan: "1. 移す" }, h.base))) as Case,
  };
  const record = { copilot: await sweep(copilotCases), acp: await sweep(acpCases), cursor: await sweep(cursorCases) };
  await matchRecord("core/guard-approvals.others.json", maskVolatile(record, { paths: { HOME: home } }));
});
