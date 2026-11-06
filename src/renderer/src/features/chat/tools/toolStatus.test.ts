import assert from "node:assert/strict";
import { test } from "node:test";
import { eventSequence } from "@shared/testing/factories";
import type { ToolCall } from "@/features/chat/timeline/timelineItems";
import { backgroundCallIds, callStatus, groupStatus, isCallRunning } from "./toolStatus";

const ev = eventSequence();
const call = (id: string, result?: { error: boolean }): ToolCall => ({
  use: ev("tool_use", { id, name: "Bash", input: {} }),
  ...(result ? { result: ev("tool_result", { tool_use_id: id, content: "", is_error: result.error }) } : {}),
});

test("呼び出し 1 件の状態: 動いていれば実行中、終わっていれば結果で完了か失敗、結果がなければ中断", () => {
  assert.equal(callStatus(call("a", { error: false }), false), "done");
  assert.equal(callStatus(call("b", { error: true }), false), "failed");
  assert.equal(callStatus(call("c"), true), "running");
  assert.equal(callStatus(call("d"), false), "stopped");
  // 裏で動かしたコマンドは「裏で始めた」という結果が届いていても、まだ動いていれば実行中
  assert.equal(callStatus(call("e", { error: false }), true), "running");
});

test("まだ動いているか: いまの作業で結果を待っているもの・裏でまだ動いている作業を起動したもの", () => {
  const none = new Set<string>();
  // 結果が届いていれば、作業中でも動いていない
  assert.equal(isCallRunning(call("f", { error: false }), true, none), false);
  assert.equal(isCallRunning(call("g"), true, none), true);
  // 前の作業で結果のないまま終わったものは動いていない
  assert.equal(isCallRunning(call("h"), false, none), false);
  // 裏でまだ動いているものは、結果が届いていても・前の作業のものでも動いている
  assert.equal(isCallRunning(call("i", { error: false }), false, new Set(["i"])), true);
});

test("裏の作業を起動した呼び出しの ID: 開始の知らせが届いて ID の分かるものだけ", () => {
  assert.deepEqual(backgroundCallIds(null), []);
  assert.deepEqual(
    backgroundCallIds({
      tasks: [
        { task_id: "b1", kind: "command", description: "npm run dev", tool_use_id: "tu1" },
        { task_id: "b2", kind: "command", description: "sleep 9" },
      ],
      replied: false,
    }),
    ["tu1"],
  );
});

test("まとまりの状態: 実行中 → 失敗 → 中断 → 完了の順に決める", () => {
  assert.equal(groupStatus(["done", "failed", "running"]), "running");
  assert.equal(groupStatus(["done", "stopped", "failed"]), "failed");
  assert.equal(groupStatus(["done", "stopped"]), "stopped");
  assert.equal(groupStatus(["done", "done"]), "done");
});
