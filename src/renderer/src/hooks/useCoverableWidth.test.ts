import assert from "node:assert/strict";
import { test } from "node:test";
import { leavesNarrowRest } from "./useCoverableWidth";

test("leavesNarrowRest: 欄の横に残す側が決めた幅より狭くなるなら覆う（間隔の分も引く。欄が全体より広ければ残りは 0）", () => {
  const board = { gap: 12, minRest: 200 };
  assert.equal(leavesNarrowRest(1000, 560, board), false); // 1000 - 12 - 560 = 428
  assert.equal(leavesNarrowRest(1000, 800, board), true); // 1000 - 12 - 800 = 188
  assert.equal(leavesNarrowRest(1000, 2000, board), true);
  // 右の欄（間隔なし・メインは 320px 残す）
  const agents = { gap: 0, minRest: 320 };
  assert.equal(leavesNarrowRest(900, 520, agents), false); // 380
  assert.equal(leavesNarrowRest(800, 520, agents), true); // 280
});

test("leavesNarrowRest: まだ測っていない（全体の幅が 0）ときは覆わない", () => {
  assert.equal(leavesNarrowRest(0, 520, { gap: 0, minRest: 320 }), false);
});
