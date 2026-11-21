import assert from "node:assert/strict";
import { test } from "vitest";
import type { SDKMessage } from "./wire";
import { createTurnTracker } from "./turnTracker";

/** 偽のメッセージ（確かめに要る欄だけ書く） */
const msg = (m: Record<string, unknown>) => m as unknown as SDKMessage;
const NOW = new Date("2026-11-21T00:00:00.000Z");
const usage = (input: number, output = 0) => ({ input_tokens: input, output_tokens: output, cache_creation_input_tokens: 10, cache_read_input_tokens: 5 });
const assistant = (uuid: string, tokens: number, parent: string | null = null, extra: Record<string, unknown> = {}) =>
  msg({ type: "assistant", uuid, parent_tool_use_id: parent, message: { content: [{ type: "text", text: `返答 ${uuid}` }], usage: usage(tokens) }, ...extra });
const result = (extra: Record<string, unknown> = {}) =>
  msg({ type: "result", subtype: "success", is_error: false, result: "できました", session_id: "s-1", total_cost_usd: 0.5, num_turns: 2, modelUsage: { big: { contextWindow: 200_000 }, small: { contextWindow: 100_000 } }, ...extra });

test("createTurnTracker: init のセッション・メインの最後のメッセージ（分岐の起点）・コンテキストを結果に入れる。サブエージェントのメッセージは数えない", () => {
  const t = createTurnTracker(null, () => NOW);
  t.note(msg({ type: "system", subtype: "init", session_id: "s-1" }));
  t.note(assistant("m-1", 100));
  t.note(msg({ type: "user", uuid: "m-2", parent_tool_use_id: null }));
  t.note(assistant("m-sub", 9_000, "tool-1"));
  t.note(result());
  assert.deepEqual(t.result({ aborted: false }), {
    status: "completed",
    result: "できました",
    sessionId: "s-1",
    costUsd: 0.5,
    turns: 2,
    context: { tokens: 115, window: 200_000 },
    lastMessageId: "m-2",
  });
});

test("createTurnTracker: メインの応答は大きさと文を圧縮前指示の門へ渡す", () => {
  const t = createTurnTracker(null);
  assert.deepEqual(t.note(assistant("m-1", 100)), { reply: { tokens: 115, text: "返答 m-1" } });
  assert.deepEqual(t.note(assistant("m-sub", 100, "tool-1")), {});
});

test("createTurnTracker: 再試行は回数と時刻を知らせ、返答が届き始めたら null で外す。応答のない再試行のあとの失敗は通信の切断", () => {
  const t = createTurnTracker(null, () => NOW);
  assert.deepEqual(t.note(msg({ type: "system", subtype: "api_retry", attempt: 1, max_retries: 10, retry_delay_ms: 500, error_status: null })), {
    retry: { attempt: 1, max_retries: 10, retry_delay_ms: 500, at: NOW.toISOString() },
  });
  assert.equal(t.note(msg({ type: "stream_event", parent_tool_use_id: null })).retry, null);
  assert.equal(t.note(msg({ type: "stream_event", parent_tool_use_id: null })).retry, undefined, "外したあとは知らせない");
  assert.equal(t.result({ aborted: false, thrown: new Error("boom") }).network, true);
  // 結果を返さずに終わったときも、応答のない再試行があれば通信の切断
  assert.deepEqual(t.result({ aborted: false }), { status: "failed", sessionId: null, error: "エージェントが結果を返さずに終了しました", lastMessageId: undefined, network: true });
});

test("createTurnTracker: 応答のある再試行だけなら通信の切断にしない（失敗の文で見分ける）", () => {
  const t = createTurnTracker(null, () => NOW);
  t.note(msg({ type: "system", subtype: "api_retry", attempt: 1, max_retries: 10, retry_delay_ms: 500, error_status: 529 }));
  assert.equal(t.result({ aborted: false, thrown: new Error("overloaded") }).network, false);
  assert.equal(t.result({ aborted: false, thrown: new Error("fetch failed") }).network, true);
});

test("createTurnTracker: 使用枠で断られたら、失敗に枠が戻る時刻を添える。超過分の知らせはそのまま渡す", () => {
  const t = createTurnTracker("s-0");
  assert.deepEqual(t.note(msg({ type: "rate_limit_event", rate_limit_info: { status: "allowed", isUsingOverage: true } })), { overage: true });
  assert.deepEqual(t.note(msg({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1_800_000_000 } })), {});
  const failed = t.result({ aborted: false, thrown: new Error("x") });
  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.usageLimit, { resetsAt: new Date(1_800_000_000_000).toISOString() });
  assert.equal(failed.sessionId, "s-0");
});

test("createTurnTracker: 返答の rate_limit のエラーと、失敗の文の使用枠の目印でも上限として扱う（時刻は分からない）", () => {
  const byReply = createTurnTracker(null);
  byReply.note(assistant("m-1", 1, null, { error: "rate_limit" }));
  byReply.note(result({ subtype: "error_during_execution", is_error: true, errors: ["止まりました"] }));
  assert.deepEqual(byReply.result({ aborted: false }).usageLimit, { resetsAt: null });

  const byText = createTurnTracker(null);
  byText.note(result({ subtype: "success", is_error: true, result: "You've hit your limit" }));
  const end = byText.result({ aborted: false });
  assert.equal(end.error, "You've hit your limit");
  assert.deepEqual(end.usageLimit, { resetsAt: null });
});

test("createTurnTracker: 圧縮の区切りは要約のあとの大きさを知らせる。分からなければ次のメインの応答で知らせる", () => {
  const known = createTurnTracker(null);
  assert.deepEqual(known.note(msg({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 150_000, post_tokens: 20_000 } })), { compacted: 20_000, context: 20_000 });
  known.note(result());
  assert.deepEqual(known.result({ aborted: false }).context, { tokens: 20_000, window: 200_000 });

  const unknown = createTurnTracker(null);
  assert.deepEqual(unknown.note(msg({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: 150_000 } })), { compacted: null });
  assert.deepEqual(unknown.note(assistant("m-1", 300)), { reply: { tokens: 315, text: "返答 m-1" }, context: 315 });
  assert.deepEqual(unknown.note(assistant("m-2", 400)), { reply: { tokens: 415, text: "返答 m-2" } }, "知らせるのは要約のあとの最初の応答だけ");
});

test("createTurnTracker: 止められたら cancelled。失敗の結果は errors か種類の文にする", () => {
  const t = createTurnTracker("s-0");
  t.note(assistant("m-1", 1));
  assert.deepEqual(t.result({ aborted: true, thrown: new Error("aborted") }), { status: "cancelled", sessionId: "s-0", lastMessageId: "m-1" });
  t.note(result({ subtype: "error_max_turns", is_error: true, errors: [] }));
  assert.equal(t.result({ aborted: false }).error, "最大ターン数に達しました");
  assert.equal(t.result({ aborted: true }).status, "cancelled");
});

test("createTurnTracker: 再開の相手の会話がないことは、決まった形の失敗で指示の前に終わったときだけ resumeSessionMissing", () => {
  const message = "No conversation found with session ID: s-gone";
  const missing = createTurnTracker("s-gone");
  missing.note(result({ subtype: "error_during_execution", is_error: true, errors: [message], session_id: "s-gone" }));
  assert.equal(missing.result({ aborted: false, thrown: new Error(`Claude Code returned an error result: ${message}`) }).resumeSessionMissing, true);

  const started = createTurnTracker("s-gone");
  started.note(msg({ type: "system", subtype: "init", session_id: "s-gone" }));
  started.note(result({ subtype: "error_during_execution", is_error: true, errors: [message], session_id: "s-gone" }));
  assert.equal(started.result({ aborted: false, thrown: new Error(`Claude Code returned an error result: ${message}`) }).resumeSessionMissing, undefined);
});

test("createTurnTracker: ファストモードを指定したのに使われなかったときだけ、理由の文を返す", () => {
  const t = createTurnTracker(null);
  assert.equal(t.fastModeNotice(true), null, "結果がまだない");
  t.note(result({ fast_mode_state: "off", fast_mode_disabled_reason: "something_new" }));
  assert.equal(t.fastModeNotice(false), null);
  assert.equal(t.fastModeNotice(true), "ファストモードは使われませんでした（something_new）");
  const on = createTurnTracker(null);
  on.note(result({ fast_mode_state: "on", fast_mode_disabled_reason: "x" }));
  assert.equal(on.fastModeNotice(true), null);
});
