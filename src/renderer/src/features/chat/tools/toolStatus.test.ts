import assert from "node:assert/strict";
import { test } from "node:test";
import { eventSequence } from "@shared/testing/factories";
import type { ToolCall } from "@/features/chat/timeline/timelineItems";
import { callStatus, groupStatus } from "./toolStatus";

const ev = eventSequence();
const call = (id: string, result?: { error: boolean }): ToolCall => ({
  use: ev("tool_use", { id, name: "Bash", input: {} }),
  ...(result ? { result: ev("tool_result", { tool_use_id: id, content: "", is_error: result.error }) } : {}),
});

test("呼び出し 1 件の状態: 結果があれば完了か失敗、なければ実行中か中断", () => {
  assert.equal(callStatus(call("a", { error: false }), false), "done");
  assert.equal(callStatus(call("b", { error: true }), false), "failed");
  assert.equal(callStatus(call("c"), true), "running");
  assert.equal(callStatus(call("d"), false), "stopped");
  // 結果が届いていれば、作業中でも実行中にしない
  assert.equal(callStatus(call("e", { error: false }), true), "done");
});

test("まとまりの状態: 実行中 → 失敗 → 中断 → 完了の順に決める", () => {
  assert.equal(groupStatus(["done", "failed", "running"]), "running");
  assert.equal(groupStatus(["done", "stopped", "failed"]), "failed");
  assert.equal(groupStatus(["done", "stopped"]), "stopped");
  assert.equal(groupStatus(["done", "done"]), "done");
});
