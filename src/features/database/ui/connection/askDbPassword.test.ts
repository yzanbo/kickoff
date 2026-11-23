import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { askDbPassword, attachDbPasswordHost, dbPasswordQueue, finishDbPassword } from "./askDbPassword";

test("askDbPassword: 同じ接続の 2 つの頼みは 1 回だけ聞き、答えを両方に返す", async () => {
  onTestFinished(attachDbPasswordHost());
  const a = askDbPassword(1, 5);
  const b = askDbPassword(1, 5);
  assert.equal(dbPasswordQueue.get().length, 1);
  finishDbPassword(true);
  assert.deepEqual(await Promise.all([a, b]), [true, true]);
  assert.equal(dbPasswordQueue.get().length, 0);
});

test("askDbPassword: いくつもの接続は 1 つずつ聞く", async () => {
  onTestFinished(attachDbPasswordHost());
  const a = askDbPassword(1, 5);
  const b = askDbPassword(1, 6);
  assert.deepEqual(dbPasswordQueue.get().map((r) => r.connectionId), [5, 6]);
  finishDbPassword(false);
  assert.equal(await a, false);
  assert.deepEqual(dbPasswordQueue.get().map((r) => r.connectionId), [6]);
  finishDbPassword(true);
  assert.equal(await b, true);
});

test("askDbPassword: 聞く画面がなければ聞かずに false", async () => {
  assert.equal(await askDbPassword(1, 5), false);
  assert.equal(dbPasswordQueue.get().length, 0);
});
