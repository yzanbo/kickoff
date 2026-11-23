import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
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
  vi.useFakeTimers();
  onTestFinished(() => void vi.useRealTimers());
  const request = createRequest(3000);
  request.ask(true);
  vi.advanceTimersByTime(3000);
  assert.equal(request.peek(), true);
  vi.advanceTimersByTime(1);
  assert.equal(request.take(), undefined);
});
