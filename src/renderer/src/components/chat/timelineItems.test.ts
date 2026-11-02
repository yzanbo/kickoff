import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunEvent } from "../../../../core/types.js";
import { groupEvents, relativize, summarizeTools, type ToolCall } from "./timelineItems.js";

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

const event = (id: number, type: string, data: object = {}): RunEvent => ({ id, run_id: 1, type, data, created_at: "2026-11-01T00:00:00Z" }) as unknown as RunEvent;

test("groupEvents: 連続するツールの実行を 1 つにまとめ、結果は呼び出しにぶら下げる。init・thinking などは出さない", () => {
  const items = groupEvents([
    event(1, "init"),
    event(2, "user", { text: "やって" }),
    event(3, "tool_use", { id: "a", name: "Read", input: {} }),
    event(4, "tool_result", { tool_use_id: "a", content: "ok" }),
    event(5, "tool_use", { id: "b", name: "Bash", input: {} }),
    event(6, "thinking"),
    event(7, "text", { text: "できました" }),
    event(8, "tool_use", { id: "c", name: "Edit", input: {} }),
    // 対応する呼び出しがない結果は捨てる
    event(9, "tool_result", { tool_use_id: "zzz" }),
  ]);
  assert.deepEqual(
    items.map((i) => i.kind + ":" + i.key),
    ["event:e2", "tools:t3", "event:e7", "tools:t8"],
  );
  const tools = items[1];
  assert.ok(tools.kind === "tools");
  assert.deepEqual(
    tools.tools.map((t) => [t.use.id, t.result?.id]),
    [
      [3, 4],
      [5, undefined],
    ],
  );
});

test("groupEvents: parent を渡すとそのサブエージェントの分だけ、渡さなければ親のエージェントの分だけ", () => {
  const events = [event(1, "text", { text: "親" }), event(2, "text", { text: "子", parent: "sub1" }), event(3, "tool_use", { id: "x", name: "Read", parent: "sub1" })];
  assert.deepEqual(
    groupEvents(events).map((i) => i.key),
    ["e1"],
  );
  assert.deepEqual(
    groupEvents(events, "sub1").map((i) => i.key),
    ["e2", "t3"],
  );
});

test("relativize: リポジトリの絶対パスを相対パスにする（リポジトリそのものは「.」）", () => {
  const repo = "/Users/me/app";
  assert.equal(relativize("/Users/me/app/src/a.ts を読む", repo), "src/a.ts を読む");
  assert.equal(relativize("cd /Users/me/app && npm test", repo), "cd . && npm test");
  assert.equal(relativize("ほかの /tmp/x", repo), "ほかの /tmp/x");
});
