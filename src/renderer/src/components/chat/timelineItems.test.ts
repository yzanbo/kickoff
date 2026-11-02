import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunEvent } from "../../../../core/types.js";
import { summarizeTools, type ToolCall } from "./timelineItems.js";

let nextId = 1;
const call = (name: string, input: object = {}): ToolCall => ({
  use: { id: nextId++, run_id: 1, type: "tool_use", data: { id: `tu${nextId}`, name, input }, created_at: "2026-11-01T00:00:00Z" } as unknown as RunEvent,
});

test("ツールのまとまりの要約: 編集・読み取りはファイルの数、それ以外は回数で 1 文にする", () => {
  assert.equal(summarizeTools([call("Bash"), call("Bash"), call("Bash"), call("Bash"), call("TodoWrite"), call("WebFetch"), call("ToolSearch"), call("AskUserQuestion")]), "4個のコマンドを実行 および その他のツールを4回使用");
  // 同じファイルを何度編集しても 1 個と数える
  assert.equal(
    summarizeTools([call("Edit", { file_path: "a.ts" }), call("Edit", { file_path: "a.ts" }), call("Write", { file_path: "b.ts" }), call("Read", { file_path: "a.ts" }), call("Grep"), call("Glob")]),
    "2個のファイルを編集、1個のファイルを読み取り および 2回検索",
  );
  assert.equal(summarizeTools([call("Agent"), call("Task")]), "サブエージェントを2件起動");
  assert.equal(summarizeTools([call("mcp__kickoff__create_task"), call("Bash")]), "1個のコマンドを実行 および Kickoff を1回使用");
  assert.equal(summarizeTools([]), "");
});
