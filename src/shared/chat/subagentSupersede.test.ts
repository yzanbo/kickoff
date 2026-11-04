import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunEvent } from "@shared/types";
import { collectSubagents, networkStoppedSubagents } from "@shared/chat/subagents";
import { textSimilarity } from "@shared/chat/subagentSupersede";

const ev = (id: number, type: RunEvent["type"], data: object): RunEvent =>
  ({ id, run_id: 1, type, data, created_at: "2026-11-03T00:00:00Z" }) as unknown as RunEvent;

const PROMPT = "日本語で報告してください。読むだけの調査です。Mac に入っている チャット画面の機能を洗い出し、Kickoff にないものを挙げてください。";
// 裏で動かして、終わりの知らせで結果を受け取る
const launch = (n: number, key: string, agent: string, description: string, prompt: string) => [
  ev(n, "tool_use", { id: key, name: "Agent", input: { description, prompt } }),
  ev(n + 1, "tool_result", { tool_use_id: key, is_error: false, content: `Async agent launched successfully.\nagentId: ${agent}` }),
  ev(n + 2, "subagent", { task_id: agent, tool_use_id: key, description, status: "running" }),
];
const failed = (n: number, key: string, agent: string, summary: string) =>
  ev(n, "subagent", { task_id: agent, tool_use_id: key, description: "", status: "failed", summary });

test("やり直し済み: 失敗のあとに、親が似た依頼の新しいサブエージェントを始めたら、その回を指す", () => {
  const events = [
    // 同時に始めた似た調査（失敗より前に始まっているので、やり直しとは数えない）
    ...launch(1, "refapp", "a0", "チャット画面の機能を洗い出す", PROMPT.replace("ほかのアプリ", "ほかのアプリ")),
    ...launch(4, "claude", "a1", "チャット画面の機能を洗い出す", PROMPT),
    failed(7, "claude", "a1", "API Error: Claude's response exceeded the 8192 output token maximum."),
    // 関係のない仕事（似ていない）
    ...launch(8, "other", "a2", "Image viewer zoom", "画像ビューアに拡大・縮小を足してください"),
    ...launch(11, "redo", "a3", "チャット画面を短く再調査", `報告は 45 行以内に。${PROMPT}`),
  ];
  const list = collectSubagents(events, {}, true);
  const failedOne = list.find((s) => s.key === "claude")!;
  assert.deepEqual(failedOne.supersededBy, { key: "redo", description: "チャット画面を短く再調査" });
  assert.equal(failedOne.outputLimit, true);
  // 動いているもの・完了したものには付けない
  assert.equal(list.find((s) => s.key === "refapp")?.supersededBy, undefined);

  // やり直しがまだなければ付けない（再開・やり直すを出す）
  assert.equal(collectSubagents(events.slice(0, 10), {}, true).find((s) => s.key === "claude")?.supersededBy, undefined);
});

test("やり直し済み: 通信の切断で止まったものも、やり直したら通信が戻ったときの再開を頼まない", () => {
  const events = [
    ...launch(1, "net", "a1", "調査", PROMPT),
    failed(4, "net", "a1", "Agent terminated early due to an API error: ECONNRESET"),
    ...launch(5, "redo", "a2", "調査（やり直し）", PROMPT),
  ];
  assert.equal(networkStoppedSubagents(events.slice(0, 4), 0).length, 1);
  assert.equal(networkStoppedSubagents(events, 0).length, 0);
});

test("文の似かた: 2 文字ずつの組の重なり", () => {
  assert.equal(textSimilarity("abc", "abc"), 1);
  assert.equal(textSimilarity("abc", "xyz"), 0);
  assert.equal(textSimilarity("", "abc"), 0);
  assert.ok(textSimilarity("チャット画面の機能を洗い出す", "チャット画面を短く再調査") >= 0.5);
  // 短い名前は、短い方に対して数える
  assert.equal(textSimilarity("調査", "調査（やり直し）", "shorter"), 1);
  assert.ok(textSimilarity("調査", "調査（やり直し）") < 0.5);
});
