import assert from "node:assert/strict";
import { test } from "vitest";
import type { BusEvent, BusInput } from "@shared/foundation/contract";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { Bus } from "@/foundation/core/bus";
import { DeltaBatch } from "./deltaBatch";
import { chatDeltaStage } from "./deltaStage";

const delta = (chat_id: number, text: string): BusInput => ({ type: "chat_delta", project_id: 1, chat_id, text });
const other: BusEvent = { type: "project_deleted", id: 3 };

/** 流した知らせを覚えるまとめ役 */
function batch() {
  const clock = manualClock();
  const out: BusInput[] = [];
  return { clock, out, deltas: new DeltaBatch((e) => out.push(e), clock) };
}

test("16ms の間の同じチャットの途中の文は 1 通にまとまり、違うチャットは別々に、ためた順で流れる", () => {
  const { clock, out, deltas } = batch();
  assert.equal(deltas.accept(delta(7, "こん")), true);
  deltas.accept(delta(8, "やあ"));
  deltas.accept(delta(7, "にちは"));
  assert.deepEqual(out, []);
  assert.equal(clock.pending, 1);
  clock.fireAll();
  assert.deepEqual(out, [delta(7, "こんにちは"), delta(8, "やあ")]);
  // 流したあとは、ためた分がない（タイマーも動いていない）
  clock.fireAll();
  assert.equal(out.length, 2);
  assert.equal(clock.pending, 0);
});

test("ほかの知らせの前に、ためた途中の文を必ず先に流す（順が「途中の文 → その知らせ」になる）", () => {
  const bus = new Bus();
  const stage = chatDeltaStage(manualClock());
  bus.use(stage);
  const seen: BusEvent[] = [];
  bus.subscribe((e) => seen.push(e));
  bus.publish(delta(7, "こん"));
  bus.publish(delta(7, "にちは"));
  bus.publish(other);
  bus.publish(delta(7, "!"));
  // バスが流す途中の文には、書きかけの返答の中の位置 offset が付く（streamingTexts.ts）
  assert.deepEqual(seen, [{ ...delta(7, "こんにちは"), offset: 0 }, other]);
  bus.flush();
  assert.deepEqual(seen, [{ ...delta(7, "こんにちは"), offset: 0 }, other, { ...delta(7, "!"), offset: 5 }]);
  assert.equal(stage.streamingText(7), "こんにちは!");
});

test("flush でタイマーが止まり、ためた分がないときは何も流さない", () => {
  const { clock, out, deltas } = batch();
  deltas.flush();
  assert.deepEqual(out, []);
  deltas.accept(delta(1, "a"));
  deltas.flush();
  assert.deepEqual(out, [delta(1, "a")]);
  assert.equal(clock.pending, 0);
  assert.equal(deltas.accept(other), false);
  assert.deepEqual(out, [delta(1, "a")]);
});
