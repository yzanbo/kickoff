import assert from "node:assert/strict";
import { test } from "node:test";
import { describeActivity, workingFor } from "./activity";

const tool = (name: string, input: Record<string, unknown>, sub = false) => ({ type: "tool_use" as const, data: { id: "t", name, input, ...(sub ? { parent: "agent1" } : {}) } });

test("いまの作業: ツールの呼び出しを短い文にする", () => {
  assert.equal(describeActivity(tool("Edit", { file_path: "/repo/src/App.tsx" })), "ファイルを編集: App.tsx");
  assert.equal(describeActivity(tool("Read", { file_path: "/repo/README.md" })), "ファイルを読み取り: README.md");
  assert.equal(describeActivity(tool("Bash", { command: "npm test\nnpm run build" })), "コマンドを実行: npm test");
  assert.equal(describeActivity(tool("Grep", { pattern: "useState" })), "検索: useState");
  assert.equal(describeActivity(tool("Agent", { description: "調べる" })), "サブエージェントを起動: 調べる");
  assert.equal(describeActivity(tool("Edit", { file_path: "/a/b.ts" }, true)), "サブエージェント: ファイルを編集: b.ts");
  assert.equal(describeActivity({ type: "thinking", data: { text: "…" } }), "考えています");
  assert.equal(describeActivity({ type: "tool_result", data: { tool_use_id: "t", content: "", is_error: false } }), null);
});

test("経過時間: 1 分未満は「作業中」、そのあとは分・時間", () => {
  const now = new Date("2026-11-02T10:00:00Z").getTime();
  assert.equal(workingFor(null, now), "作業中");
  assert.equal(workingFor("2026-11-02T09:59:30Z", now), "作業中");
  assert.equal(workingFor("2026-11-02T09:57:00Z", now), "作業中 3分");
  assert.equal(workingFor("2026-11-02T08:55:00Z", now), "作業中 1時間5分");
  assert.equal(workingFor("2026-11-02T08:00:00Z", now), "作業中 2時間");
});
