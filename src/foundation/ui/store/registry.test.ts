import assert from "node:assert/strict";
import { test } from "vitest";
import { createRegistry } from "./registry";

test("createRegistry: 置き直したら前のものは外れ、前の返り値で外しても後のものは残る", () => {
  const registry = createRegistry<string, number>();
  let calls = 0;
  registry.subscribe(() => calls++);
  const offFirst = registry.set("a", 1);
  const offSecond = registry.set("a", 2);
  assert.equal(registry.get("a"), 2);
  offFirst();
  assert.deepEqual(registry.values(), [2]);
  offSecond();
  assert.equal(registry.get("a"), undefined);
  assert.equal(calls, 3);
});
