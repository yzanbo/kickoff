import assert from "node:assert/strict";
import { test } from "vitest";
import { codexCreditSpendText, codexCreditStateOf, extraUsageSpendText, formatMinorAmount, overageStateOf } from "./overage";
import type { PayAsYouGo } from "@shared/ai/usage";

const pay = (patch: Partial<PayAsYouGo> = {}): PayAsYouGo => ({ enabled: true, unlimited: false, balance: null, utilization: null, used: null, limit: null, currency: "USD", spending: null, checked_at: null, ...patch });
const checked = "2026-11-18T00:00:00Z";

test("超過分の様子: いま超過分で動いている知らせが先、次に追加の使用枠のオン・オフ、どちらもなければ不明", () => {
  assert.equal(overageStateOf(pay({ enabled: false, spending: { since: checked }, checked_at: checked })), "in_use");
  assert.equal(overageStateOf(pay({ checked_at: checked })), "on");
  assert.equal(overageStateOf(pay({ enabled: false })), "off");
  assert.equal(overageStateOf(pay({ enabled: null, checked_at: checked })), "unknown");
  assert.equal(overageStateOf(null), "unknown");
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
  assert.equal(extraUsageSpendText(pay({ used: 320, limit: 5000, utilization: 6.4 })), "今月の超過分 $3.20 / 上限 $50.00（6%）");
  assert.equal(extraUsageSpendText(pay({ used: 0 })), "今月の超過分 $0.00");
  assert.equal(extraUsageSpendText(pay()), null);
  // 追加の使用枠の情報が返っていなければ出さない
  assert.equal(extraUsageSpendText(pay({ enabled: null, used: 320 })), null);
});

const credits = (patch: Partial<PayAsYouGo> = {}): PayAsYouGo => pay({ currency: null, balance: 150, ...patch });

test("Codex のクレジットの様子: 減ったのを見たら使用中、無制限か残りがあればあり、なければなし、情報がなければ不明", () => {
  assert.equal(codexCreditStateOf(credits({ spending: { since: "2026-11-18T00:00:00Z", from: 150, to: 142 } })), "in_use");
  assert.equal(codexCreditStateOf(credits()), "on");
  assert.equal(codexCreditStateOf(credits({ balance: null })), "on");
  assert.equal(codexCreditStateOf(credits({ enabled: false, unlimited: true, balance: null })), "on");
  assert.equal(codexCreditStateOf(credits({ balance: 0 })), "off");
  assert.equal(codexCreditStateOf(credits({ enabled: false, balance: null })), "off");
  assert.equal(codexCreditStateOf(null), "unknown");
});

test("Codex のクレジットが減った分の 1 行（差は小数の誤差を丸める）。減っていなければ null", () => {
  assert.equal(codexCreditSpendText(credits({ spending: { since: "2026-11-18T00:00:00Z", from: 150.3, to: 142.1 } })), "クレジットの残り 150.3 → 142.1（8.2 減りました）");
  assert.equal(codexCreditSpendText(credits()), null);
});
