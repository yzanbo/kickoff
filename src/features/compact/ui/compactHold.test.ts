import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChatLive } from "@shared/foundation/testing/factories";
import { compactHoldOf } from "./compactHold";

test("「いま」を預かる間: 圧縮前指示の作業中 → 圧縮中 → 圧縮のあとのやり取り（手で圧縮する実行の終わりまで段階が awaiting_compact のままでも）→ 預からない", () => {
  assert.equal(compactHoldOf(makeChatLive({})), null);
  assert.equal(compactHoldOf(makeChatLive({ phase: "running" })), null);
  assert.equal(compactHoldOf(makeChatLive({ phase: "awaiting_compact" })), "awaiting");
  assert.equal(compactHoldOf(makeChatLive({ phase: "compacting", compaction: { awaiting: false, after_turn: false, done: true } })), "compacting");
  assert.equal(compactHoldOf(makeChatLive({ phase: "awaiting_compact", compaction: { awaiting: false, after_turn: false, done: true } })), "post");
  assert.equal(compactHoldOf(makeChatLive({ phase: "compacted", compaction: { awaiting: false, after_turn: false, done: true } })), "post");
});
