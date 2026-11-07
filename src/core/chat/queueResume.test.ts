import assert from "node:assert/strict";
import { test } from "node:test";
import { eventSequence } from "@shared/testing/factories";
import { resumeMomentsOf, toolLine } from "./queueResume.js";

test("止まったところ: 最後の自分の指示から後ろの、メインエージェントの最後の返答・ツールを拾う（サブエージェントのもの・前の作業のものは拾わない）", () => {
  const ev = eventSequence();
  const events = [
    ev("user", { text: "前の指示", message_uuid: "u0" }),
    ev("text", { text: "前の返答" }),
    ev("user", { text: "いまの指示", message_uuid: "u1" }),
    ev("tool_use", { id: "t1", name: "Read", input: { file_path: "/a/b.ts" } }),
    ev("text", { text: "  読みました  " }),
    ev("tool_use", { id: "t2", name: "Grep", input: { pattern: "x" }, parent: "agent" }),
    ev("text", { text: "サブエージェントの文", parent: "agent" }),
  ];
  const moments = resumeMomentsOf([...events].reverse());
  assert.equal(moments.last_prompt?.text, "いまの指示");
  assert.equal(moments.last_reply?.text, "読みました");
  assert.equal(moments.last_tool?.text, "Read: /a/b.ts");
  assert.equal(moments.stopped_at, events.at(-1)?.created_at);
  // 返答・ツールがまだなければ null
  assert.deepEqual(resumeMomentsOf([...events.slice(0, 3)].reverse()).last_reply, null);
  assert.deepEqual(resumeMomentsOf([]), { last_prompt: null, last_reply: null, last_tool: null, stopped_at: null });
});

test("ツールの 1 行: 何をしたかが分かる項目を添え、長ければ切る。分からなければ名前だけ", () => {
  assert.equal(toolLine("Bash", { command: "npm  test\n  --watch" }), "Bash: npm test --watch");
  assert.equal(toolLine("TodoWrite", { todos: [] }), "TodoWrite");
  assert.match(toolLine("Bash", { command: "x".repeat(300) }), /…$/);
});
