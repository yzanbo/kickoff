import assert from "node:assert/strict";
import { test } from "vitest";
import { fixedWindowRange, scrollTopFor } from "./useFixedWindow";

test("fixedWindowRange: 見えている行と上下の overscan だけを描く", () => {
  assert.deepEqual(fixedWindowRange({ count: 100, rowHeight: 20, overscan: 2, scrollTop: 0, viewport: 100 }), { first: 0, last: 6 });
  assert.deepEqual(fixedWindowRange({ count: 100, rowHeight: 20, overscan: 2, scrollTop: 210, viewport: 100 }), { first: 8, last: 17 });
  assert.deepEqual(fixedWindowRange({ count: 10, rowHeight: 20, overscan: 2, scrollTop: 150, viewport: 100 }), { first: 5, last: 9 });
  // 行がない・まだ大きさを測っていない
  assert.deepEqual(fixedWindowRange({ count: 0, rowHeight: 20, overscan: 2, scrollTop: 0, viewport: 100 }), { first: 0, last: -1 });
  assert.deepEqual(fixedWindowRange({ count: 5, rowHeight: 20, overscan: 2, scrollTop: 0, viewport: 0 }), { first: 0, last: 1 });
});

test("scrollTopFor: 見えていなければ上か下の端に合わせ、見えていれば null", () => {
  assert.equal(scrollTopFor(2, 20, 100, 100), 40);
  assert.equal(scrollTopFor(10, 20, 100, 100), 120);
  assert.equal(scrollTopFor(6, 20, 100, 100), null);
});
