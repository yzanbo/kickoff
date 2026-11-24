import { test } from "vitest";
import assert from "node:assert/strict";
import type { ChatEvent } from "@shared/chat/chatEvent";
import { indexOfEvents, type IndexContext } from "@shared/chat/chatIndex";
import { scenarioChat } from "@shared/chat/testing/chatScenarios";
import { collectVisuals } from "./aiVisual";

const NO_CONTEXT: IndexContext = { approvalCallIds: [], backgroundCallIds: [] };

/** 索引 ＋ 末尾（切れ目 s の前は索引、s から後ろは中身のまま） */
const digestAt = (events: readonly ChatEvent[], s: number) =>
  s >= events.length ? indexOfEvents(events, Number.MAX_SAFE_INTEGER, NO_CONTEXT) : [...indexOfEvents(events, events[s].id, NO_CONTEXT), ...events.slice(s)];

test("どの切れ目の索引 ＋ 末尾でも、図の一覧が記録全体から作るものと同じになる（ランダムな記録。種は固定）", () => {
  for (const [seed, running] of [[1, false], [2, true], [3, false], [7, true]] as const) {
    const events = scenarioChat({ turns: 24, seed, running });
    const full = [...collectVisuals(events)];
    assert.ok(full.length > 0, `種 ${seed} の記録に図がある`);
    for (let s = 0; s <= events.length; s++) {
      assert.deepEqual([...collectVisuals(digestAt(events, s))], full, `種 ${seed}・切れ目 ${s}（記録 ${events[s]?.id ?? "終わり"} から末尾）`);
    }
  }
});
