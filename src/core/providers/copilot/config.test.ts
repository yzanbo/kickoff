// Copilot SDK の形に直す純粋関数
import { test } from "vitest";
import assert from "node:assert/strict";
import type { BashSandbox } from "../../chat/sandbox/bashSandbox.js";
import { toModelOptions } from "./catalog.js";
import { byokProvider, copilotSandbox, runtimeEnv } from "./config.js";
import { toolAsKickoff } from "./events.js";

const sandbox: BashSandbox = { writableDirs: ["/memo", "/cache"], readOnlyDirs: ["/uploads"], unsandboxedCommands: [], proxyPort: null };

test("砂場: 書けるのは作業場所と書けるフォルダ・読むことと通信は絞らない・MCP は砂場に入れない。計画モードは何も書かせない。砂場がなければ渡さない", () => {
  assert.equal(copilotSandbox({ bashSandbox: null, permissionMode: "default" }), undefined);
  const on = copilotSandbox({ bashSandbox: sandbox, permissionMode: "default" })!;
  assert.equal(on.enabled, true);
  assert.equal(on.addCurrentWorkingDirectory, true);
  assert.equal(on.sandboxMcpServers, false);
  assert.equal(on.allowBypass, false);
  assert.deepEqual(on.userPolicy?.filesystem, { readwritePaths: ["/memo", "/cache"], readonlyPaths: ["/", "/uploads"] });
  assert.deepEqual(on.userPolicy?.network, { allowOutbound: true, allowLocalNetwork: true });
  const plan = copilotSandbox({ bashSandbox: sandbox, permissionMode: "plan" })!;
  assert.equal(plan.addCurrentWorkingDirectory, false);
  assert.deepEqual(plan.userPolicy?.filesystem?.readwritePaths, []);
});

test("API キー（BYOK）: キーの頭で Anthropic・Google・OpenAI を決め、選んだモデルがあればそれ。サブスク・キーなしは null", () => {
  assert.equal(byokProvider(undefined, null), null);
  assert.equal(byokProvider({ mode: "subscription", apiKey: null }, null), null);
  assert.equal(byokProvider({ mode: "api_key", apiKey: null }, null), null);
  assert.equal(byokProvider({ mode: "api_key", apiKey: "AIzaXYZ" }, null)?.provider.type, "google");
  const openai = byokProvider({ mode: "api_key", apiKey: "sk-proj-1" }, "gpt-x")!;
  assert.deepEqual(openai, { provider: { type: "openai", baseUrl: "https://api.openai.com/v1", wireApi: "responses", apiKey: "sk-proj-1" }, model: "gpt-x" });
});

test("ランタイムの環境: Copilot のログインを置き換える GitHub のトークンを外す", () => {
  const env = runtimeEnv({ PATH: "/bin", COPILOT_GITHUB_TOKEN: "a" }, { GH_TOKEN: "b", PORT: "1" });
  assert.deepEqual(env, { PATH: "/bin", PORT: "1" });
});

test("ツールの名前: コマンド・新しいファイル・置き換え・読む・MCP を Claude Code の形に、知らないものはそのまま", () => {
  assert.deepEqual(toolAsKickoff("bash", { command: "ls", description: "x" }), { name: "Bash", input: { command: "ls" } });
  assert.deepEqual(toolAsKickoff("create", { path: "/w/a", file_text: "x" }), { name: "Write", input: { file_path: "/w/a", content: "x" } });
  assert.deepEqual(toolAsKickoff("edit", { path: "/w/a", old_str: "a", new_str: "b" }), { name: "Edit", input: { file_path: "/w/a", old_string: "a", new_string: "b" } });
  assert.deepEqual(toolAsKickoff("view", { path: "/w/a" }), { name: "Read", input: { file_path: "/w/a" } });
  assert.equal(toolAsKickoff("x", {}, { server: "kickoff_db", tool: "db_query" }).name, "mcp__kickoff_db__db_query");
  assert.deepEqual(toolAsKickoff("web_fetch", { url: "u" }), { name: "web_fetch", input: { url: "u" } });
});

test("モデルの一覧: 組織の決まりで切られたものは除き、深さは Kickoff の値だけ", () => {
  const caps = { supports: { vision: false, reasoningEffort: true }, limits: { max_context_window_tokens: 1 } };
  const options = toModelOptions([
    { id: "a", name: "A", capabilities: caps, supportedReasoningEfforts: ["low", "high", "weird"], billing: { multiplier: 1 } },
    { id: "b", name: "B", capabilities: caps, policy: { state: "disabled", terms: "" } },
  ]);
  assert.deepEqual(options, [{ value: "a", label: "A", description: "プレミアムリクエスト ×1", efforts: ["low", "high"], supports_auto_mode: true, supports_fast_mode: false }]);
});
