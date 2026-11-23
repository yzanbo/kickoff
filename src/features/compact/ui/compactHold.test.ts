import assert from "node:assert/strict";
import { test } from "vitest";
import { EMPTY_QUEUE_STATE } from "@shared/chat/chatLive";
import { makeChatLive, makeQueuedMessage } from "@shared/chat/testing";
import { compactHoldOf, compactingLabel, compactsAfterTurn, reservedRow } from "./compactHold";

test("「いま」を預かる間: 圧縮前指示の作業中 → 圧縮中 → 圧縮のあとのやり取り（手で圧縮する実行の終わりまで段階が awaiting_compact のままでも）→ 預からない", () => {
  assert.equal(compactHoldOf(makeChatLive({})), null);
  assert.equal(compactHoldOf(makeChatLive({ phase: "running" })), null);
  assert.equal(compactHoldOf(makeChatLive({ phase: "awaiting_compact" })), "awaiting");
  assert.equal(compactHoldOf(makeChatLive({ phase: "compacting", compaction: { awaiting: false, after_turn: false, done: true } })), "compacting");
  assert.equal(compactHoldOf(makeChatLive({ phase: "awaiting_compact", compaction: { awaiting: false, after_turn: false, done: true } })), "post");
  assert.equal(compactHoldOf(makeChatLive({ phase: "compacted", compaction: { awaiting: false, after_turn: false, done: true } })), "post");
});

test("作業中に頼んだ圧縮の予約は compaction の after_turn から", () => {
  assert.equal(compactsAfterTurn(makeChatLive({ compaction: { awaiting: true, after_turn: true, done: false } })), true);
  assert.equal(compactsAfterTurn(makeChatLive({})), false);
});

test("reservedRow: コアが予約とした（reserved）ときだけ、送信待ちのいちばん上の行", () => {
  const row = (text: string, action?: "compact" | "clear") => makeQueuedMessage(text, action ? { [action]: true } : {});
  const compact = row("", "compact");
  const queue = { ...EMPTY_QUEUE_STATE, messages: [compact, row("2")] };
  assert.equal(reservedRow({ ...queue, reserved: "compact" }), compact);
  assert.equal(reservedRow(queue), null);
});

test("compactingLabel: 自動か手でか", () => {
  assert.equal(compactingLabel("auto"), "会話を自動で圧縮しています");
  assert.equal(compactingLabel("manual"), "会話を圧縮しています");
});
