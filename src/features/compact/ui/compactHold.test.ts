import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChatLive } from "@shared/foundation/testing/factories";
import { compactHoldOf } from "./compactHold";

test("「いま」を預かる間: 圧縮前指示の作業中 → 圧縮中 → 圧縮のあとのやり取り（手で圧縮する実行の終わりまで awaiting が残っていても）→ 預からない", () => {
  const compacting = { since: "2026-11-07T00:00:00.000Z", trigger: "manual" as const };
  assert.equal(compactHoldOf(makeChatLive({})), null);
  assert.equal(compactHoldOf(makeChatLive({ awaiting_compact: true })), "awaiting");
  assert.equal(compactHoldOf(makeChatLive({ awaiting_compact: true, compacting, compacted_turn: true })), "compacting");
  assert.equal(compactHoldOf(makeChatLive({ awaiting_compact: true, compacted_turn: true })), "post");
  assert.equal(compactHoldOf(makeChatLive({ compacted_turn: true })), "post");
});
