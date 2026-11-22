import assert from "node:assert/strict";
import { test } from "vitest";
import { createActionLock } from "./useActionButton";

test("createActionLock: 同じキーが返るまで次は始めず、返ったら（失敗でも）また始められる。キーが違えば並べて始める", async () => {
  const changes: string[][] = [];
  const lock = createActionLock((p) => changes.push([...p]));
  let calls = 0;
  let finish!: () => void;
  const slow = () => (calls++, new Promise<void>((r) => (finish = r)));
  const first = lock.run("resume", slow);
  assert.ok(first);
  assert.equal(lock.run("resume", slow), null);
  assert.ok(lock.run("retry", async () => {}));
  finish();
  await first;
  assert.equal(calls, 1);
  await assert.rejects(lock.run("resume", () => Promise.reject(new Error("x")))!);
  assert.ok(lock.run("resume", async () => {}));
  assert.deepEqual(changes[0], ["resume"]);
  assert.deepEqual(changes[1], ["resume", "retry"]);
});
