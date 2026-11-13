import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatLive } from "@shared/types";
import { compactHoldOf } from "./compactHold";

const live = (over: Partial<ChatLive>): ChatLive => ({
  queue: { messages: [], paused: false, stops: [], waiting_edit: false },
  background: null,
  retry: null,
  reconnect: null,
  compacting: null,
  stopping: false,
  after_compact: [],
  awaiting_compact: false,
  compact_after_turn: false,
  compacted_turn: false,
  tells_closed: false,
  queue_resume: null,
  ...over,
});

test("「いま」を預かる間: 圧縮前指示の作業中 → 圧縮中 → 圧縮のあとのやり取り（手で圧縮する実行の終わりまで awaiting が残っていても）→ 預からない", () => {
  const compacting = { since: "2026-11-07T00:00:00.000Z", trigger: "manual" as const };
  assert.equal(compactHoldOf(live({})), null);
  assert.equal(compactHoldOf(live({ awaiting_compact: true })), "awaiting");
  assert.equal(compactHoldOf(live({ awaiting_compact: true, compacting, compacted_turn: true })), "compacting");
  assert.equal(compactHoldOf(live({ awaiting_compact: true, compacted_turn: true })), "post");
  assert.equal(compactHoldOf(live({ compacted_turn: true })), "post");
});
