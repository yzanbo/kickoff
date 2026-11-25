import assert from "node:assert/strict";
import { test } from "vitest";
import { createReadHolds } from "./readHolds";

test("readHolds: 手で未読にした覚えは、外すか作業が始まって最後に動いた時刻が進むまで効く", () => {
  const holds = createReadHolds();
  const chat = { id: 1, active_at: "2026-11-26T00:00:00.000Z" };
  assert.equal(holds.isHeld(chat), false);
  holds.hold(chat);
  assert.equal(holds.isHeld(chat), true);
  assert.equal(holds.isHeld({ id: 2, active_at: chat.active_at }), false);
  // 返信を送って状態が変わると、最後に動いた時刻が進む
  assert.equal(holds.isHeld({ ...chat, active_at: "2026-11-26T00:01:00.000Z" }), false);
  holds.release(chat.id);
  assert.equal(holds.isHeld(chat), false);
});
