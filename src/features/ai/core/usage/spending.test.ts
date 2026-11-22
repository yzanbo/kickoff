import assert from "node:assert/strict";
import { test } from "vitest";
import type { PayAsYouGo } from "@shared/ai/usage";
import { applySpending } from "./spending";

const note = (balance: number | null, limit_reached: boolean | null = true) => ({ has_credits: true, unlimited: false, balance, limit_reached });

/** 知らせを順に重ね、引かれ始めたか・配り直すかと、重ねたあとの支払いの様子を返す */
function run(steps: [ReturnType<typeof note> | { has_credits: null; unlimited: null; balance: null; limit_reached: null }, string][]) {
  let pay: PayAsYouGo | null = null;
  return steps.map(([n, at]) => {
    const step = applySpending(pay, n, at);
    pay = step.next;
    return { started: step.started, changed: step.changed, credits: step.next };
  });
}

test("Codex のクレジット: 残りが減ったら引かれ始めたと返し、減り続ける間は to を進め、上限に達した枠がなくなったら外す", () => {
  const [first, dropped, more, unknown, freed] = run([
    [note(150, false), "t0"],
    [note(142), "t1"],
    [note(130), "t2"],
    [{ has_credits: null, unlimited: null, balance: null, limit_reached: null }, "t3"],
    [note(130, false), "t4"],
  ]);
  // 初めて見た残りでは比べる相手がない
  assert.deepEqual([first.started, first.changed, first.credits?.spending], [false, true, null]);
  // 減った: 引かれ始めた
  assert.deepEqual([dropped.started, dropped.credits?.spending], [true, { since: "t1", from: 150, to: 142 }]);
  // 減り続ける: 始まりはそのまま、引かれ始めたとはもう返さない
  assert.deepEqual([more.started, more.credits?.spending], [false, { since: "t1", from: 150, to: 130 }]);
  // 分からない知らせ（残りも枠も null）は前の値のままで、配り直さない
  assert.deepEqual([unknown.started, unknown.changed, unknown.credits?.balance, unknown.credits?.enabled], [false, false, 130, true]);
  // 枠に空きが戻った: 外す
  assert.deepEqual([freed.started, freed.changed, freed.credits?.spending], [false, true, null]);
});

test("Codex のクレジット: 枠に空きがあっても、同じ知らせで残りが減ったのを見たら引かれたとする", () => {
  const [, dropped] = run([
    [note(150, false), "t0"],
    [note(149, false), "t1"],
  ]);
  assert.deepEqual([dropped.started, dropped.credits?.spending], [true, { since: "t1", from: 150, to: 149 }]);
});

test("超過分の知らせ（Claude）: 動き始めたときだけ started、変わったときだけ changed。確かめた時刻は毎回進める", () => {
  const a = applySpending(null, { in_use: true }, "t1");
  assert.deepEqual([a.started, a.changed, a.next.spending, a.next.checked_at], [true, true, { since: "t1" }, "t1"]);
  const b = applySpending(a.next, { in_use: true }, "t2");
  assert.deepEqual([b.started, b.changed, b.next.spending, b.next.checked_at], [false, false, { since: "t1" }, "t2"]);
  const c = applySpending(b.next, { in_use: false }, "t3");
  assert.deepEqual([c.started, c.changed, c.next.spending], [false, true, null]);
  const d = applySpending(c.next, { in_use: true }, "t4");
  assert.deepEqual([d.started, d.changed, d.next.spending], [true, true, { since: "t4" }]);
  // 知らされる前は、超過分ではないと知らされても配る（分からない → 分かった）
  assert.deepEqual([applySpending(null, { in_use: false }, "t5").changed, applySpending(null, { in_use: false }, "t5").started], [true, false]);
});
