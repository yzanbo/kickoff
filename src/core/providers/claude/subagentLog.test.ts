import assert from "node:assert/strict";
import { test } from "node:test";
import { subagentLogOf } from "./subagentLog.js";

test("サブエージェントの会話: 依頼・発言・ツールの呼び出しと結果を組にして古い順に並べ、注意書きと考えている途中は入れない", () => {
  const log = subagentLogOf([
    { type: "user", message: { role: "user", content: "src を調べて" } },
    { type: "user", message: { role: "user", content: [{ type: "text", text: "<system-reminder>\n注意\n</system-reminder>" }] } },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "考え中" },
          { type: "text", text: "見ていきます。" },
          { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
          { type: "tool_use", id: "t2", name: "Read", input: { file_path: "/a.png" } },
        ],
      },
    },
    {
      type: "user",
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "a\nb", is_error: false },
          { type: "tool_result", tool_use_id: "t2", content: [{ type: "image" }], is_error: true },
        ],
      },
    },
    { type: "system", message: { content: "無視" } },
    { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "終わりです。" }] } },
  ]);
  assert.deepEqual(log, [
    { kind: "user", text: "src を調べて" },
    { kind: "assistant", text: "見ていきます。" },
    { kind: "tool", name: "Bash", input: { command: "ls" }, result: "a\nb", isError: false },
    { kind: "tool", name: "Read", input: { file_path: "/a.png" }, result: "[image]", isError: true },
    { kind: "assistant", text: "終わりです。" },
  ]);
});
