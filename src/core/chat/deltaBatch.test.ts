import assert from "node:assert/strict";
import { test } from "vitest";
import type { BusEvent } from "@shared/types";
import { busEvent } from "@shared/testing/factories";
import { fakeTimers } from "../testing/fakeTimers.js";
import { Bus } from "../bus.js";
import { DeltaBatch } from "./deltaBatch.js";

const delta = (chat_id: number, text: string) => busEvent("chat_delta", { project_id: 1, chat_id, text });
const other: BusEvent = { type: "project_deleted", id: 3 };

/** 流した知らせを覚えるまとめ役 */
function batch() {
  const clock = fakeTimers();
  const out: BusEvent[] = [];
  return { clock, out, deltas: new DeltaBatch((e) => out.push(e), clock.timers) };
}

test("16ms の間の同じチャットの途中の文は 1 通にまとまり、違うチャットは別々に、ためた順で流れる", () => {
  const { clock, out, deltas } = batch();
  assert.equal(deltas.accept(delta(7, "こん")), true);
  deltas.accept(delta(8, "やあ"));
  deltas.accept(delta(7, "にちは"));
  assert.deepEqual(out, []);
  assert.equal(clock.size, 1);
  clock.fire();
  assert.deepEqual(out, [delta(7, "こんにちは"), delta(8, "やあ")]);
  // 流したあとは、ためた分がない（タイマーも動いていない）
  clock.fire();
  assert.equal(out.length, 2);
  assert.equal(clock.size, 0);
});

test("ほかの知らせの前に、ためた途中の文を必ず先に流す（順が「途中の文 → その知らせ」になる）", () => {
  const bus = new Bus(fakeTimers().timers);
  const seen: BusEvent[] = [];
  bus.subscribe((e) => seen.push(e));
  bus.publish(delta(7, "こん"));
  bus.publish(delta(7, "にちは"));
  bus.publish(other);
  bus.publish(delta(7, "!"));
  // バスが流す途中の文には、書きかけの返答の中の位置 offset が付く（chat/streamingTexts.ts）
  assert.deepEqual(seen, [{ ...delta(7, "こんにちは"), offset: 0 }, other]);
  bus.flushDeltas();
  assert.deepEqual(seen, [{ ...delta(7, "こんにちは"), offset: 0 }, other, { ...delta(7, "!"), offset: 5 }]);
  assert.equal(bus.streamingText(7), "こんにちは!");
});

test("flush でタイマーが止まり、ためた分がないときは何も流さない", () => {
  const { clock, out, deltas } = batch();
  deltas.flush();
  assert.deepEqual(out, []);
  deltas.accept(delta(1, "a"));
  deltas.flush();
  assert.deepEqual(out, [delta(1, "a")]);
  assert.equal(clock.size, 0);
  assert.equal(deltas.accept(other), false);
  assert.deepEqual(out, [delta(1, "a")]);
});
