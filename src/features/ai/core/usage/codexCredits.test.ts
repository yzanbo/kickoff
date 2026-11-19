import assert from "node:assert/strict";
import { test } from "vitest";
import type { CodexCredits } from "@shared/types";
import { Bus } from "@/foundation/core/bus";
import { CodexCreditsWatch } from "./codexCredits";

const note = (balance: number | null, limit_reached: boolean | null = true) => ({ has_credits: true, unlimited: false, balance, limit_reached });

test("Codex のクレジット: 残りが減ったら引かれ始めたと返し、減り続ける間は to を進め、上限に達した枠がなくなったら外す", () => {
  const bus = new Bus();
  const published: (CodexCredits["spending"])[] = [];
  bus.subscribe((e) => { if (e.type === "codex_credits") published.push(e.credits.spending); });
  const watch = new CodexCreditsWatch(bus);
  // 初めて見た残りでは比べる相手がない
  assert.equal(watch.note(note(150, false), "t0"), false);
  assert.equal(watch.current()?.spending, null);
  // 減った: 引かれ始めた
  assert.equal(watch.note(note(142), "t1"), true);
  assert.deepEqual(watch.current()?.spending, { since: "t1", from: 150, to: 142 });
  // 減り続ける: 始まりはそのまま、引かれ始めたとはもう返さない
  assert.equal(watch.note(note(130), "t2"), false);
  assert.deepEqual(watch.current()?.spending, { since: "t1", from: 150, to: 130 });
  // 分からない知らせ（残りも枠も null）は前の値のまま
  assert.equal(watch.note({ has_credits: null, unlimited: null, balance: null, limit_reached: null }, "t3"), false);
  assert.equal(watch.current()?.balance, 130);
  assert.equal(watch.current()?.has_credits, true);
  // 枠に空きが戻った: 外す
  assert.equal(watch.note(note(130, false), "t4"), false);
  assert.equal(watch.current()?.spending, null);
  // 配ったのは変わったときだけ（t3 の分からない知らせは配らない）
  assert.deepEqual(published, [null, { since: "t1", from: 150, to: 142 }, { since: "t1", from: 150, to: 130 }, null]);
});

test("Codex のクレジット: 枠に空きがあっても、同じ知らせで残りが減ったのを見たら引かれたとする", () => {
  const watch = new CodexCreditsWatch();
  watch.note(note(150, false), "t0");
  assert.equal(watch.note(note(149, false), "t1"), true);
  assert.deepEqual(watch.current()?.spending, { since: "t1", from: 150, to: 149 });
});
