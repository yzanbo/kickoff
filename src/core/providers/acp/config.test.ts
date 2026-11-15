// ACP の形に直す純粋関数（メモの仕様書「0021」の段階 5）
import { test } from "vitest";
import assert from "node:assert/strict";
import { configChoices, launchEnv, modeFor } from "./config.js";
import { optionFor } from "./permissions.js";
import { callAsTools, mcpToolOf } from "./updates.js";

const modes = (...ids: string[]) => ids.map((id) => ({ id, name: id }));

test("モード: 計画モードは plan、ほかは毎回聞くモード（agy は default、Cursor は agent）。なければ変えない", () => {
  assert.equal(modeFor(modes("default", "accept-edits", "plan", "auto"), "auto"), "default");
  assert.equal(modeFor(modes("agent", "plan", "ask"), "acceptEdits"), "agent");
  assert.equal(modeFor(modes("agent", "plan", "ask"), "plan"), "plan");
  assert.equal(modeFor(modes("ask"), "default"), null);
});

test("設定の項目: 選んだモデル・考える深さは、エージェントが出した項目で選べる値のときだけ送る", () => {
  const options = [
    { id: "model", name: "Model", category: "model", type: "select", currentValue: "m1", options: [{ value: "m1", name: "M1" }, { group: "g", name: "G", options: [{ value: "m2", name: "M2" }] }] },
    { id: "think", name: "Thinking", category: "thought_level", type: "select", currentValue: "low", options: [{ value: "low", name: "Low" }, { value: "high", name: "High" }] },
  ];
  assert.deepEqual(configChoices(options, { model: "m2", effort: "high" }), [
    { configId: "model", value: "m2" },
    { configId: "think", value: "high" },
  ]);
  assert.deepEqual(configChoices(options, { model: "m1", effort: "max" }), [], "いまの値・選べない値は送らない");
  assert.deepEqual(configChoices(options, { model: null, effort: null }), []);
});

test("起動の環境変数: 鍵の変数は外し、API キーのときだけ決めた変数に入れる。Kickoff の変数（GH_TOKEN など）は重ねる", () => {
  const keys = { keyVars: ["CURSOR_API_KEY"], apiKeyVar: "CURSOR_API_KEY" };
  assert.deepEqual(launchEnv({ PATH: "/bin", CURSOR_API_KEY: "old" }, { env: { GH_TOKEN: "g" } }, keys), { PATH: "/bin", GH_TOKEN: "g" });
  assert.deepEqual(launchEnv({ PATH: "/bin" }, { auth: { mode: "api_key", apiKey: "k" } }, keys), { PATH: "/bin", CURSOR_API_KEY: "k" });
  assert.deepEqual(launchEnv({}, { auth: { mode: "api_key", apiKey: null } }, keys), {});
});

test("権限の答えの選択肢: 種類で選ぶ（このセッションの間は allow_always を先に。断るときは reject_once）。合う選択肢がなければ断る側に倒す", () => {
  const request = (kinds: string[]) => ({ sessionId: "s", toolCall: { toolCallId: "t" }, options: kinds.map((kind) => ({ optionId: `o-${kind}`, name: kind, kind: kind as never })) });
  assert.deepEqual(optionFor(request(["allow_once", "allow_always", "reject_once"]), { allow: true, forSession: true }), { outcome: { outcome: "selected", optionId: "o-allow_always" } });
  assert.deepEqual(optionFor(request(["allow_always", "reject_always"]), { allow: true }), { outcome: { outcome: "selected", optionId: "o-allow_always" } });
  assert.deepEqual(optionFor(request(["allow_once", "reject_always"]), { allow: false, reason: "x" }), { outcome: { outcome: "selected", optionId: "o-reject_always" } });
  assert.deepEqual(optionFor(request(["allow_once"]), { allow: false, reason: "x" }), { outcome: { outcome: "cancelled" } });
});

test("ツールの名前: コアの MCP サーバーのツールは mcp__<サーバー>__<ツール>、新しいファイルは Write、消すのは MultiEdit（deleted）", () => {
  const servers = ["kickoff_chat"];
  assert.deepEqual(mcpToolOf({ toolCallId: "t", title: "kickoff_chat/list_family_chats" }, servers), { server: "kickoff_chat", tool: "list_family_chats" });
  assert.deepEqual(mcpToolOf({ toolCallId: "t", name: "mcp__kickoff_chat__open_memo" }, servers), { server: "kickoff_chat", tool: "open_memo" });
  assert.equal(mcpToolOf({ toolCallId: "t", title: "mcp__other__x" }, servers), null);
  assert.deepEqual(callAsTools({ toolCallId: "t", kind: "edit", content: [{ type: "diff", path: "/w/n.ts", oldText: null, newText: "x" }] }, servers), [{ name: "Write", input: { file_path: "/w/n.ts", content: "x" } }]);
  assert.deepEqual(callAsTools({ toolCallId: "t", kind: "delete", locations: [{ path: "/w/old.ts" }] }, servers), [{ name: "MultiEdit", input: { file_path: "/w/old.ts", edits: [{ old_string: "", new_string: "" }], deleted: true } }]);
});
