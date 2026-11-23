// 網: 全部の機能を偽の時計で組み立てても、時計を進めなければ、HTTP の頼みのほかに何も起きない（勝手に回る本物のタイマーがない）
import assert from "node:assert/strict";
import { test } from "vitest";
import type { BusEvent } from "@shared/foundation/contract";
import { settle } from "@shared/foundation/testing/async";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { createTestCore } from "@/app/core/testing/testCore";

/** いま動いている本物のタイマーの数 */
const realTimers = () => process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;

test("全部の機能を載せても、何もしていなければ時計に予約がなく、知らせも本物のタイマーも増えない", async () => {
  const before = realTimers();
  const clock = manualClock();
  const core = createTestCore({ clock });
  const events: BusEvent[] = [];
  core.bus.subscribe((e) => events.push(e));
  assert.equal((await core.call("GET", "/api/status")).status, 200);
  await settle();
  assert.deepEqual(events, []);
  assert.equal(clock.pending, 0);
  assert.equal(realTimers(), before);
});
