import assert from "node:assert/strict";
import { test } from "vitest";
import { restartDelay } from "./coreRestart";

const min = 60_000;

test("restartDelay: 続けて落ちた何回目かで 0.5 → 2 → 5 秒待ち、5 分の間に 3 回落ちたら作り直さない", () => {
  assert.equal(restartDelay([0], 0), 500);
  assert.equal(restartDelay([0, 1 * min], 1 * min), 2_000);
  assert.equal(restartDelay([0, 1 * min, 2 * min], 2 * min), null);
  // 5 分より前のものは数えないが、続けて落ちているあいだは待ちを延ばす
  assert.equal(restartDelay([0, 4 * min, 8 * min], 8 * min), 5_000);
  // 5 分落ちずに動いたら、待ちは最初に戻る
  assert.equal(restartDelay([0, 1 * min, 7 * min], 7 * min), 500);
  assert.equal(restartDelay([], 0), 500);
});
