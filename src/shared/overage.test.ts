import assert from "node:assert/strict";
import { test } from "vitest";
import { codexCreditSpendText, codexCreditStateOf, extraUsageSpendText, formatMinorAmount, overageStateOf } from "./overage";
import type { CodexCredits, ExtraUsage } from "./types";

const extra = (patch: Partial<ExtraUsage> = {}): ExtraUsage => ({ enabled: true, utilization: null, used_credits: null, monthly_limit: null, currency: "USD", ...patch });
const note = (in_use: boolean) => ({ in_use, observed_at: "2026-11-18T00:00:00Z" });

test("超過分の様子: いま超過分で動いている知らせが先、次に追加の使用枠のオン・オフ、どちらもなければ不明", () => {
  assert.equal(overageStateOf({ extra_usage: extra({ enabled: false }), overage: note(true) }), "in_use");
  assert.equal(overageStateOf({ extra_usage: extra(), overage: note(false) }), "on");
  assert.equal(overageStateOf({ extra_usage: extra({ enabled: false }), overage: null }), "off");
  assert.equal(overageStateOf({ extra_usage: null, overage: note(false) }), "unknown");
  assert.equal(overageStateOf({}), "unknown");
  assert.equal(overageStateOf(undefined), "unknown");
});

test("額: 通貨の最小単位から通貨の書き方にする（円は小数なし）。知らない・ない通貨は記号なしで小数 2 桁", () => {
  assert.equal(formatMinorAmount(12345, "USD"), "$123.45");
  assert.equal(formatMinorAmount(0, "usd"), "$0.00");
  assert.equal(formatMinorAmount(500, "JPY"), "¥500");
  assert.equal(formatMinorAmount(320, null), "3.20");
  assert.equal(formatMinorAmount(320, "??"), "3.20");
});

test("今月の超過分の 1 行: 額・上限・割合を分かる分だけ。額が分からなければ null", () => {
  assert.equal(extraUsageSpendText(extra({ used_credits: 320, monthly_limit: 5000, utilization: 6.4 })), "今月の超過分 $3.20 / 上限 $50.00（6%）");
  assert.equal(extraUsageSpendText(extra({ used_credits: 0 })), "今月の超過分 $0.00");
  assert.equal(extraUsageSpendText(extra()), null);
});

const credits = (patch: Partial<CodexCredits> = {}): CodexCredits => ({ has_credits: true, unlimited: false, balance: 150, spending: null, ...patch });

test("Codex のクレジットの様子: 減ったのを見たら使用中、無制限か残りがあればあり、なければなし、情報がなければ不明", () => {
  assert.equal(codexCreditStateOf(credits({ spending: { since: "2026-11-18T00:00:00Z", from: 150, to: 142 } })), "in_use");
  assert.equal(codexCreditStateOf(credits()), "on");
  assert.equal(codexCreditStateOf(credits({ balance: null })), "on");
  assert.equal(codexCreditStateOf(credits({ has_credits: false, unlimited: true, balance: null })), "on");
  assert.equal(codexCreditStateOf(credits({ balance: 0 })), "off");
  assert.equal(codexCreditStateOf(credits({ has_credits: false, balance: null })), "off");
  assert.equal(codexCreditStateOf(null), "unknown");
});

test("Codex のクレジットが減った分の 1 行（差は小数の誤差を丸める）。減っていなければ null", () => {
  assert.equal(codexCreditSpendText(credits({ spending: { since: "2026-11-18T00:00:00Z", from: 150.3, to: 142.1 } })), "クレジットの残り 150.3 → 142.1（8.2 減りました）");
  assert.equal(codexCreditSpendText(credits()), null);
});
