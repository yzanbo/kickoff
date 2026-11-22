import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChatLive } from "@shared/foundation/testing/factories";
import { afterCompactUntilOf, compactsAfterTurn, isInheriting, isWaitingCompact } from "./workPhase";

test("親の会話を写しているのは、送る準備の段階で理由が引き継ぎのときだけ", () => {
  assert.equal(isInheriting(makeChatLive({ phase: "preparing", preparing_for: "inherit" })), true);
  assert.equal(isInheriting(makeChatLive({ phase: "preparing", preparing_for: "send" })), false);
  assert.equal(isInheriting(makeChatLive({ phase: "running", preparing_for: null })), false);
});

test("圧縮を待つ間は、圧縮前指示の作業中と圧縮中（圧縮したあとのやり取りは含めない）", () => {
  assert.equal(isWaitingCompact(makeChatLive({ phase: "awaiting_compact" })), true);
  assert.equal(isWaitingCompact(makeChatLive({ phase: "compacting" })), true);
  assert.equal(isWaitingCompact(makeChatLive({ phase: "compacted", compaction: { awaiting: false, after_turn: false, done: true } })), false);
  assert.equal(isWaitingCompact(makeChatLive({ phase: "running" })), false);
});

test("預かった「いま」の指示を送る時: 圧縮を待つ間 → 足せなくなったあと → 圧縮したやり取りの途中 → 作業の終わりの順", () => {
  assert.equal(afterCompactUntilOf(makeChatLive({ phase: "compacting", input_closed: true })), "compact");
  assert.equal(afterCompactUntilOf(makeChatLive({ phase: "awaiting_compact", compaction: { awaiting: false, after_turn: false, done: true } })), "compact");
  assert.equal(afterCompactUntilOf(makeChatLive({ phase: "compacted", compaction: { awaiting: false, after_turn: false, done: true }, input_closed: true })), "closed");
  assert.equal(afterCompactUntilOf(makeChatLive({ phase: "compacted", compaction: { awaiting: false, after_turn: false, done: true } })), "exchange");
  assert.equal(afterCompactUntilOf(makeChatLive({ phase: "running" })), "turn");
});

test("作業中に頼んだ圧縮の予約は compaction の after_turn から", () => {
  assert.equal(compactsAfterTurn(makeChatLive({ compaction: { awaiting: true, after_turn: true, done: false } })), true);
  assert.equal(compactsAfterTurn(makeChatLive({})), false);
});
