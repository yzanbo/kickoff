import assert from "node:assert/strict";
import { test } from "vitest";
import { makeSubagent } from "@shared/chat/testing";
import { isSubagentHalted, showsSubagentStatus, subagentStatusClass, subagentStatusLabel, subagentStatusTitle } from "./subagentList";

const done = (patch = {}) => makeSubagent("a", { status: "completed", ...patch });

test("状態の文: 細かい様子があればその文、なければチャットと同じ言葉（完了は「完了」・回答待ちが先）", () => {
  assert.equal(subagentStatusLabel(makeSubagent("a")), "作業中");
  assert.equal(subagentStatusLabel(makeSubagent("a"), true), "回答待ち");
  assert.equal(subagentStatusLabel(done()), "完了");
  assert.equal(subagentStatusLabel(done({ status: "failed" })), "失敗");
  assert.equal(subagentStatusLabel(done({ status: "failed", outputLimit: true })), "失敗（出力の上限）");
  assert.equal(subagentStatusLabel(done({ status: "failed", network: true })), "通信の切断で中断");
  assert.equal(subagentStatusLabel(done({ status: "stopped" })), "中断");
  assert.equal(subagentStatusLabel(done({ delivery: "pending" })), "報告済み（受け取り待ち）");
  assert.equal(subagentStatusLabel(done({ delivery: "lost" })), "報告が届いていません");
  assert.equal(subagentStatusLabel(done({ status: "stopped", supersededBy: { key: "b", description: "やり直し" } })), "やり直し済み");
});

test("やり直し済みの説明は、止まった理由とやり直した回の名前（ほかは出さない）", () => {
  assert.equal(subagentStatusTitle(done({ status: "stopped", supersededBy: { key: "b", description: "調べ直し" } })), "中断のあと、起動したエージェントが「調べ直し」としてやり直しています");
  assert.equal(subagentStatusTitle(done()), undefined);
});

test("色のクラス: 回答待ち・通信の切断・受け取り待ち・届いていない・やり直し済みは分け、ほかは status", () => {
  assert.equal(subagentStatusClass(makeSubagent("a"), true), "status-needs-input");
  assert.equal(subagentStatusClass(done({ status: "failed", network: true })), "status-network");
  assert.equal(subagentStatusClass(done({ delivery: "pending" })), "status-awaiting");
  assert.equal(subagentStatusClass(done({ delivery: "lost" })), "status-undelivered");
  assert.equal(subagentStatusClass(done({ status: "stopped", supersededBy: { key: "b", description: "x" } })), "status-superseded");
  assert.equal(subagentStatusClass(done({ status: "failed" })), "status-failed");
  assert.equal(subagentStatusClass(makeSubagent("a")), "status-running");
});

test("状態の文を出すか: 親が受け取った完了だけ出さない。止まったもの（やり直し済みを除く）は再開のボタンを出す", () => {
  assert.equal(showsSubagentStatus(done()), false);
  assert.equal(showsSubagentStatus(done({ delivery: "pending" })), true);
  assert.equal(showsSubagentStatus(makeSubagent("a")), true);
  assert.equal(isSubagentHalted(done({ status: "failed" })), true);
  assert.equal(isSubagentHalted(done({ status: "stopped" })), true);
  assert.equal(isSubagentHalted(done({ status: "stopped", supersededBy: { key: "b", description: "x" } })), false);
  assert.equal(isSubagentHalted(done()), false);
});
