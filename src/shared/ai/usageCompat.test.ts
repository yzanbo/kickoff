import assert from "node:assert/strict";
import { test } from "vitest";
import type { UsageWindow } from "./types";
import type { PayAsYouGo, ProviderUsage } from "./usage";
import { toCodexCredits, toPlanUsage, toServiceUsage } from "./usageCompat";

const win = (key: string, label: string, utilization: number | null): UsageWindow => ({ key, label, utilization, resets_at: null });
const claude: ProviderUsage = {
  provider: "claude",
  status: "ok",
  plan: "max",
  account: null,
  windows: [win("five_hour", "5時間", null), win("seven_day", "週", 42), win("model:Fable", "週（Fable）", 48)],
  notes: [],
  pay_as_you_go: null,
  fetched_at: "2026-11-02T00:00:00.000Z",
};
const pay = (patch: Partial<PayAsYouGo>): PayAsYouGo => ({ enabled: null, unlimited: false, balance: null, utilization: null, used: null, limit: null, currency: null, spending: null, checked_at: null, ...patch });

test("プランの使用枠の前の形: 5 時間・週・モデル別の週に分け、追加の使用枠と超過分の知らせを写す", () => {
  const u = toPlanUsage(claude);
  assert.equal(u.provider_label, "Claude");
  assert.equal(u.available, true);
  assert.deepEqual([u.five_hour.utilization, u.seven_day.utilization, u.model_weekly.map((w) => w.label)], [null, 42, ["週（Fable）"]]);
  assert.equal(u.extra_usage, null);
  assert.equal(u.overage, null);
  // 追加の使用枠（オン・額）と、知らせた超過分（確かめた時刻があれば in_use の真偽）
  const withPay = toPlanUsage({ ...claude, pay_as_you_go: pay({ enabled: true, used: 320, limit: 5000, utilization: 6.4, currency: "USD", spending: { since: "t1" }, checked_at: "t2" }) });
  assert.deepEqual(withPay.extra_usage, { enabled: true, utilization: 6.4, used_credits: 320, monthly_limit: 5000, currency: "USD" });
  assert.deepEqual(withPay.overage, { in_use: true, observed_at: "t2" });
  // 追加の使用枠の情報がなく、超過分ではないと知らされた
  const notInUse = toPlanUsage({ ...claude, pay_as_you_go: pay({ checked_at: "t3" }) });
  assert.equal(notInUse.extra_usage, null);
  assert.deepEqual(notInUse.overage, { in_use: false, observed_at: "t3" });
  // 取れなかった（前の値がない）・最新の取得に失敗した
  assert.deepEqual([toPlanUsage({ ...claude, status: "error", windows: [], message: "timeout" }).available, toPlanUsage({ ...claude, status: "error", message: "timeout" }).error], [false, "timeout"]);
  assert.equal(toPlanUsage({ ...claude, error: "timeout" }).error, "timeout");
});

test("サービスの使用状況の前の形: Claude は下の帯と同じ値。取れなければ unavailable、失敗の理由は添える", () => {
  const u = toServiceUsage(claude);
  assert.equal(u.status, "ok");
  assert.equal(u.label, "Claude Code");
  assert.deepEqual(u.windows.map((w) => w.label), ["5時間", "週", "週（Fable）"]);
  assert.equal("credits" in u, false);
  assert.equal(toServiceUsage({ ...claude, error: "timeout" }).message, "最新の取得に失敗: timeout");
  const unavailable = toServiceUsage({ ...claude, status: "unavailable" });
  assert.deepEqual([unavailable.status, unavailable.plan, unavailable.windows], ["unavailable", null, []]);
  const failed = toServiceUsage({ ...claude, status: "unavailable", error: "timeout" });
  assert.deepEqual([failed.status, failed.plan, failed.message], ["error", "max", "timeout"]);
});

test("サービスの使用状況の前の形: クレジットの欄は Codex だけ。名前は前のサービスの名前", () => {
  const codex = toServiceUsage({ ...claude, provider: "codex", windows: [], pay_as_you_go: pay({ enabled: true, balance: 150, spending: { since: "t1", from: 150, to: 142 } }) });
  assert.deepEqual(codex.credits, { has_credits: true, unlimited: false, balance: 150, spending: { since: "t1", from: 150, to: 142 } });
  assert.equal(toServiceUsage({ ...claude, provider: "codex", pay_as_you_go: null }).credits, null);
  const gemini = toServiceUsage({ ...claude, provider: "gemini", status: "unavailable", message: "ログインしていません" });
  assert.deepEqual([gemini.label, "credits" in gemini, gemini.message, gemini.plan], ["Gemini", false, "ログインしていません", "max"]);
  assert.equal(toCodexCredits(null), null);
});
