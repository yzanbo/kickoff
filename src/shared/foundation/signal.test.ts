import assert from "node:assert/strict";
import { test } from "vitest";
import { createSignal } from "./signal";

test("createSignal: 受け手を登録の順に呼び、外したら呼ばない", () => {
  const signal = createSignal<number>();
  const got: string[] = [];
  const offA = signal.subscribe((n) => got.push(`a${n}`));
  signal.subscribe((n) => got.push(`b${n}`));
  signal.emit(1);
  offA();
  signal.emit(2);
  assert.deepEqual(got, ["a1", "b1", "b2"]);
});
