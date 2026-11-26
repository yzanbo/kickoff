// Codex の形に直す純粋関数
import { test } from "vitest";
import assert from "node:assert/strict";
import type { ProviderTurnParams } from "@/features/ai/core/providers/types";
import { turnParams } from "@/features/ai/core/providers/testing/contract";
import { appServerLaunch, codexEffort, codexSandboxPolicy, mcpServerOverrides, threadOverrides, turnInput, CODEX_MCP_TOOL_TIMEOUT_S } from "./config";
import { changeAsTool, diffEdits } from "./items";
import { askModelOf, creditsNoteOf, toModelOptions } from "./catalog";
import { turnResult } from "./turn";
import type { CodexModel } from "./protocol";

const params = (extra: Partial<ProviderTurnParams> = {}) => turnParams({ systemPrompt: "文脈", tools: [], ...extra });

test("推論の深さ: max は xhigh、null は指定しない", () => {
  assert.equal(codexEffort(null), null);
  assert.equal(codexEffort("high"), "high");
  assert.equal(codexEffort("max"), "xhigh");
});

test("AI の操作ツール: mcp_servers.<名前> に URL・鍵の見出し・長い待ち時間・聞かずに使わせるツールの approve を入れる", () => {
  const tools = [{ name: "kickoff_chat", url: "http://127.0.0.1:1/mcp/kickoff_chat", headers: { Authorization: "Bearer k" }, autoAllow: ["list_family_chats"] }];
  const over = mcpServerOverrides(tools, "default");
  assert.deepEqual(over["mcp_servers.kickoff_chat"], {
    url: "http://127.0.0.1:1/mcp/kickoff_chat",
    http_headers: { Authorization: "Bearer k" },
    tool_timeout_sec: CODEX_MCP_TOOL_TIMEOUT_S,
    default_tools_approval_mode: "prompt",
    tools: { list_family_chats: { approval_mode: "approve" } },
  });
  assert.equal((mcpServerOverrides(tools, "auto")["mcp_servers.kickoff_chat"] as { default_tools_approval_mode: string }).default_tools_approval_mode, "approve");
});

test("砂場と上書き: 計画は読むだけ、ほかは書けるフォルダ。承認は on-request で守りは PreToolUse のフック、システムプロンプトは developer_instructions", () => {
  const sandbox = { writableDirs: ["/note"], readOnlyDirs: ["/ref"], unsandboxedCommands: [], proxyPort: null };
  assert.deepEqual(codexSandboxPolicy(params({ permissionMode: "plan" })), { type: "readOnly", networkAccess: true });
  assert.deepEqual(codexSandboxPolicy(params({ sandbox: sandbox })), { type: "workspaceWrite", writableRoots: ["/note"], networkAccess: true, excludeTmpdirEnvVar: false, excludeSlashTmp: false });
  const over = threadOverrides(params({ sandbox: sandbox, model: "gpt-x" }));
  assert.equal(over.approvalPolicy, "on-request");
  // 守りのフック（Bash と apply_patch）と、フックの口の URL・鍵を AI のコマンドから外す
  assert.equal(over.config?.["features.hooks"], true);
  assert.equal((over.config?.["hooks.PreToolUse"] as { matcher: string }[])[0].matcher, "^(Bash|apply_patch)$");
  assert.deepEqual(over.config?.["shell_environment_policy.exclude"], ["KICKOFF_CODEX_HOOK_URL", "KICKOFF_CODEX_HOOK_TOKEN"]);
  // 作業フォルダの信頼をこちらから伝える（Codex が利用者の config.toml に書き足さないように。パスの「.」で区切らない入れ子）
  assert.deepEqual(threadOverrides(params({ cwd: "/w/my.app" })).config?.projects, { "/w/my.app": { trust_level: "trusted" } });
  assert.equal(over.sandbox, "workspace-write");
  assert.equal(over.developerInstructions, "文脈");
  assert.deepEqual(over.config?.["sandbox_workspace_write.writable_roots"], ["/note"]);
  assert.equal(over.config?.["shell_environment_policy.ignore_default_excludes"], undefined);
  assert.equal(threadOverrides(params({ auth: { mode: "api_key", apiKey: "k" } })).config?.["shell_environment_policy.ignore_default_excludes"], false);
});

test("共通のチャットで一時フォルダに置いた利用者のプロジェクトがあれば、一時フォルダを書ける場所から外し、コマンドの一時ファイルを作業場所の置き場に向ける", () => {
  // 砂場の一覧には一時フォルダの実体（/private/tmp・$TMPDIR）も書けるフォルダとして入っている。書かせないフォルダを中に持つ /private/tmp は渡さない
  const sandbox = { writableDirs: ["/note", "/private/tmp", "/private/var/folders/x/T"], readOnlyDirs: ["/private/tmp/alpha"], unsandboxedCommands: [], proxyPort: null, commandTempDir: "/w/.kickoff-tmp" };
  assert.deepEqual(codexSandboxPolicy(params({ sandbox })), { type: "workspaceWrite", writableRoots: ["/note", "/private/var/folders/x/T"], networkAccess: true, excludeTmpdirEnvVar: true, excludeSlashTmp: true });
  const config = threadOverrides(params({ sandbox, env: { GH_TOKEN: "g" } })).config;
  assert.deepEqual(config?.["sandbox_workspace_write.writable_roots"], ["/note", "/private/var/folders/x/T"]);
  assert.equal(config?.["sandbox_workspace_write.exclude_slash_tmp"], true);
  assert.equal(config?.["sandbox_workspace_write.exclude_tmpdir_env_var"], true);
  assert.deepEqual(config?.["shell_environment_policy.set"], { GH_TOKEN: "g", TMPDIR: "/w/.kickoff-tmp", TMPPREFIX: "/w/.kickoff-tmp/zsh" });
  // 置き場がなければ（プロジェクトのチャット・ふつうの置き場所）これまでどおり一時フォルダを書ける
  const plain = threadOverrides(params({ sandbox: { ...sandbox, commandTempDir: null } })).config;
  assert.equal(plain?.["sandbox_workspace_write.exclude_slash_tmp"], undefined);
  assert.deepEqual(plain?.["sandbox_workspace_write.writable_roots"], ["/note", "/private/tmp", "/private/var/folders/x/T"]);
  assert.equal(plain?.["shell_environment_policy.set"], undefined);
  // 計画モード・砂場オフは変えない
  assert.deepEqual(codexSandboxPolicy(params({ sandbox, permissionMode: "plan" })), { type: "readOnly", networkAccess: true });
  assert.deepEqual(codexSandboxPolicy(params({ sandbox, sandboxOff: true })), { type: "dangerFullAccess" });
});

test("利用者が選んだ砂場オフは thread と turn の両方に渡す。計画モードは読むだけを維持する", () => {
  const off = params({ sandboxOff: true, permissionMode: "auto" });
  assert.equal(threadOverrides(off).sandbox, "danger-full-access");
  assert.deepEqual(codexSandboxPolicy(off), { type: "dangerFullAccess" });
  const plan = params({ sandboxOff: true, permissionMode: "plan" });
  assert.equal(threadOverrides(plan).sandbox, "read-only");
  assert.deepEqual(codexSandboxPolicy(plan), { type: "readOnly", networkAccess: true });
  assert.equal(threadOverrides(params()).sandbox, "workspace-write");
});

test("指示: 添える文脈を先に、別の塊で", () => {
  assert.deepEqual(turnInput({ prompt: "p", turnContext: "c" }).map((i) => i.text), ["c", "p"]);
  assert.deepEqual(turnInput({ prompt: "p", turnContext: null }).map((i) => i.text), ["p"]);
});

test("起動: サブスクは鍵の環境変数を外し、API キーは CODEX_API_KEY と forced_login_method で渡す（起動の引数に鍵を載せない）", () => {
  const base = { PATH: "/bin", OPENAI_API_KEY: "old", CODEX_API_KEY: "old2" };
  const sub = appServerLaunch({ ...base, KICKOFF_CODEX_HOOK_TOKEN: "stale" }, { env: { GH_TOKEN: "g" } }, { url: "http://127.0.0.1:1/", token: "t" });
  assert.deepEqual(sub.args, ["app-server"]);
  // フックの口は環境変数で渡す（起動の引数には載せない。前の値は引き継がない）
  assert.equal(sub.env.KICKOFF_CODEX_HOOK_URL, "http://127.0.0.1:1/");
  assert.equal(sub.env.KICKOFF_CODEX_HOOK_TOKEN, "t");
  assert.equal(appServerLaunch({ KICKOFF_CODEX_HOOK_TOKEN: "stale" }, {}).env.KICKOFF_CODEX_HOOK_TOKEN, undefined);
  assert.equal(sub.env.OPENAI_API_KEY, undefined);
  assert.equal(sub.env.CODEX_API_KEY, undefined);
  assert.equal(sub.env.GH_TOKEN, "g");
  const api = appServerLaunch(base, { auth: { mode: "api_key", apiKey: "sk-1" } });
  assert.equal(api.env.CODEX_API_KEY, "sk-1");
  assert.deepEqual(api.args, ["app-server", "-c", 'forced_login_method="api"']);
  assert.ok(!api.args.join(" ").includes("sk-1"));
});

test("ファイルの変更: 差分の塊ごとに old_string / new_string（Claude Code の MultiEdit の形）、足したファイルは Write", () => {
  const diff = "--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n@@ -10,1 +10,2 @@\n z\n+y\n";
  assert.deepEqual(diffEdits(diff), [
    { old_string: "a\nb\nc", new_string: "a\nB\nc" },
    { old_string: "z", new_string: "z\ny" },
  ]);
  assert.deepEqual(changeAsTool({ path: "/w/n.ts", kind: { type: "add" }, diff: "+one\n+two\n" }), { name: "Write", input: { file_path: "/w/n.ts", content: "one\ntwo" } });
  assert.equal(changeAsTool({ path: "/w/x", kind: { type: "update", move_path: null }, diff }).name, "MultiEdit");
});

const model = (extra: Partial<CodexModel>): CodexModel => ({
  id: "m",
  model: "m",
  displayName: "M",
  description: "",
  hidden: false,
  supportedReasoningEfforts: [],
  defaultReasoningEffort: "medium",
  isDefault: false,
  ...extra,
});

test("モデル: 隠すものを除き、深さは Kickoff の段だけ。1 回だけ聞くモデルは既定と mini から選ぶ", () => {
  const models = [
    model({ model: "gpt-big", isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: "minimal", description: "" }, { reasoningEffort: "high", description: "" }] }),
    model({ model: "gpt-big-mini" }),
    model({ model: "secret", hidden: true }),
  ];
  const options = toModelOptions(models);
  assert.deepEqual(options.map((o) => o.value), ["gpt-big", "gpt-big-mini"]);
  assert.deepEqual(options[0].efforts, ["high"]);
  assert.equal(options[0].default_effort, "medium");
  assert.equal(toModelOptions([model({ defaultReasoningEffort: "" })])[0].default_effort, undefined);
  assert.equal(toModelOptions([model({ defaultReasoningEffort: "future" })])[0].default_effort, "future");
  assert.deepEqual(askModelOf(models, "standard"), { model: "gpt-big", effort: "medium" });
  assert.deepEqual(askModelOf(models, "light"), { model: "gpt-big-mini", effort: "low" });
  assert.deepEqual(askModelOf([], "light"), { model: null, effort: "low" });
  // mini がなければ、説明が速い・安いと言うモデル（gpt-6-luna の形）
  const noMini = [model({ model: "gpt-6.1-sol", isDefault: true, description: "Latest workhorse model." }), model({ model: "gpt-6-luna", description: "Fast and affordable model for easier tasks." })];
  assert.deepEqual(askModelOf(noMini, "light"), { model: "gpt-6-luna", effort: "low" });
});

test("実行中の使用枠の知らせのクレジット: 書いていない項目は null。クレジットも枠もなければ何も知らせない", () => {
  const window = (usedPercent: number) => ({ usedPercent, windowDurationMins: 300, resetsAt: null });
  assert.deepEqual(creditsNoteOf({ primary: window(100), secondary: window(40), planType: null, credits: { hasCredits: true, unlimited: false, balance: "12.5" } }), {
    has_credits: true, unlimited: false, balance: 12.5, limit_reached: true,
  });
  // 枠だけの知らせ（クレジットは前の値のまま）
  assert.deepEqual(creditsNoteOf({ primary: window(30), secondary: null, planType: null }), { has_credits: null, unlimited: null, balance: null, limit_reached: false });
  assert.equal(creditsNoteOf({ primary: null, secondary: null, planType: null, credits: null }), null);
  assert.equal(creditsNoteOf(undefined), null);
});

test("結果: 終わったらターンの ID を分岐の起点に、通信の切断と使用枠の上限を見分ける", () => {
  const usage = { total: { totalTokens: 9, inputTokens: 0, outputTokens: 0 }, last: { totalTokens: 5, inputTokens: 0, outputTokens: 0 }, modelContextWindow: 100 };
  assert.deepEqual(turnResult({ id: "t1", status: "completed", error: null }, "thr", usage, "答え", null), {
    status: "completed",
    sessionId: "thr",
    result: "答え",
    lastMessageId: "t1",
    context: { tokens: 5, window: 100 },
  });
  assert.equal(turnResult({ id: "t", status: "interrupted", error: null }, "thr", null, "", null).status, "cancelled");
  const net = turnResult({ id: "t", status: "failed", error: { message: "x", codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: null } }, additionalDetails: null } }, "thr", null, "", null);
  assert.equal(net.network, true);
  const limit = turnResult({ id: "t", status: "failed", error: { message: "x", codexErrorInfo: "usageLimitExceeded", additionalDetails: null } }, "thr", null, "", null);
  assert.deepEqual(limit.usageLimit, { resetsAt: null });
  assert.equal(limit.network, undefined);
});

test("GitHub のアカウントのトークン: Codex が名前で外す変数は set で AI のコマンドに渡し、ほかの環境変数は足さない", () => {
  assert.equal(threadOverrides(params({})).config?.["shell_environment_policy.set"], undefined);
  const over = threadOverrides(params({ env: { GH_TOKEN: "gho_x", PORT: "20100" } }));
  assert.deepEqual(over.config?.["shell_environment_policy.set"], { GH_TOKEN: "gho_x" });
});
