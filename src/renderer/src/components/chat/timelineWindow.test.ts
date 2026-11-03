import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunEvent } from "../../../../core/types.js";
import { itemIndexOfEvent, windowStart } from "./timelineWindow.js";
import type { TimelineItem } from "./timelineItems.js";

const ev = (id: number) => ({ id }) as unknown as RunEvent;

test("流れの窓: 最近の shown 件を描き、移り先が窓の外なら、その少し前から描く", () => {
  assert.equal(windowStart(500, 120), 380);
  assert.equal(windowStart(50, 120), 0);
  // 移り先が窓の中ならそのまま
  assert.equal(windowStart(500, 120, 400), 380);
  // 窓の外なら、10 件前から
  assert.equal(windowStart(500, 120, 100), 90);
  assert.equal(windowStart(500, 120, 3), 0);
  assert.equal(windowStart(500, 120, -1), 380);
});

test("流れの窓: 記録の ID から項目の位置を探す（発言と、ツールの呼び出し・結果）", () => {
  const items: TimelineItem[] = [
    { kind: "event", key: "e1", event: ev(1) },
    { kind: "tools", key: "t2", tools: [{ use: ev(2), result: ev(3) }, { use: ev(4) }] },
    { kind: "event", key: "e5", event: ev(5) },
  ];
  assert.equal(itemIndexOfEvent(items, 1), 0);
  assert.equal(itemIndexOfEvent(items, 3), 1);
  assert.equal(itemIndexOfEvent(items, 4), 1);
  assert.equal(itemIndexOfEvent(items, 5), 2);
  assert.equal(itemIndexOfEvent(items, 9), -1);
});
