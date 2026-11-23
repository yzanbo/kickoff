import assert from "node:assert/strict";
import { test } from "vitest";
import { createFakeScheduler } from "@shared/foundation/testing/fakeScheduler";
import { createRequest } from "./request";

test("createRequest: 頼むと聞いている受け手に知らせ、受け取ったら消える", () => {
  const request = createRequest<number>(3000);
  let calls = 0;
  const off = request.subscribe(() => calls++);
  assert.equal(request.peek(), undefined);
  request.ask(12);
  assert.equal(calls, 1);
  assert.equal(request.peek(), 12);
  assert.equal(request.take(), 12);
  assert.equal(request.take(), undefined);
  off();
  request.ask(3);
  assert.equal(calls, 1);
});

test("createRequest: 受け取られないまま時間を過ぎた頼みは捨てる", () => {
  const clock = createFakeScheduler();
  const request = createRequest(3000, clock);
  request.ask(true);
  clock.advance(3000);
  assert.equal(request.peek(), true);
  clock.advance(1);
  assert.equal(request.take(), undefined);
});
