import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatEvent } from "@shared/types";
import { itemIndexOfEvent, MAX_TAIL, revealRange, TIMELINE_WINDOW, windowStart } from "./timelineWindow";
import type { TimelineItem } from "./timelineItems";

// 種類を問わない記録（位置を探すだけなので、中身は見ない）
const ev = <T extends ChatEvent>(id: number) => ({ id }) as unknown as T;

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

test("流れの窓: 移り先が最新に近ければ最新まで、遠ければ移り先の前後だけを描く", () => {
  // 最新まで MAX_TAIL 件以内なら、10 件前から最新まで
  assert.deepEqual(revealRange(500, 300), { start: 290, end: null });
  // 遠ければ、10 件前から移り先のあと TIMELINE_WINDOW 件まで
  assert.deepEqual(revealRange(20000, 100), { start: 90, end: 100 + TIMELINE_WINDOW });
  assert.deepEqual(revealRange(20000, 3), { start: 0, end: 3 + TIMELINE_WINDOW });
  // ちょうど境目
  assert.deepEqual(revealRange(1000, 1000 - MAX_TAIL + 10), { start: 1000 - MAX_TAIL, end: null });
  // 最新のすぐ近くでも、ふだんの窓より短くしない
  assert.deepEqual(revealRange(1000, 995), { start: 1000 - TIMELINE_WINDOW, end: null });
  assert.deepEqual(revealRange(50, 45), { start: 0, end: null });
});
