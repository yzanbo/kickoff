import assert from "node:assert/strict";
import { test } from "vitest";
import { createSlots } from "./frameSlots";

test("createSlots: 上限まではすぐ渡し、超えた分は空きが返るのを待って古い順に渡す。待つのをやめたものには渡さない", () => {
  const slots = createSlots(2);
  const got: string[] = [];
  const a = slots.acquire(() => got.push("a"));
  slots.acquire(() => got.push("b"));
  const c = slots.acquire(() => got.push("c"));
  slots.acquire(() => got.push("d"));
  assert.deepEqual(got, ["a", "b"]);
  // c は待つのをやめる → a が返ると d に渡る
  c();
  a();
  assert.deepEqual(got, ["a", "b", "d"]);
  // 何度返しても 1 回分
  a();
  slots.acquire(() => got.push("e"));
  assert.deepEqual(got, ["a", "b", "d"]);
});
