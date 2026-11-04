import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanUsage } from "@shared/types";
import { parseCodexUsage } from "./codex.js";
import { jwtClaims } from "./common.js";
import { parseCopilotUsage } from "./copilot.js";
import { parseCursorUsage } from "./cursor.js";
import { geminiPlan, isConsumerShutdown, parseGeminiQuota } from "./gemini.js";
import { claudeServiceUsage } from "./index.js";

test("Codex: 5 時間・週の枠とクレジットを読む（枠の名前は長さから）", () => {
  const u = parseCodexUsage(
    {
      plan_type: "pro",
      rate_limit: {
        primary_window: { used_percent: 15, reset_at: 1_735_401_600, limit_window_seconds: 18_000 },
        secondary_window: { used_percent: 5, reset_at: 1_735_920_000, limit_window_seconds: 604_800 },
      },
      credits: { has_credits: true, unlimited: false, balance: 150 },
    },
    "a@example.com",
    "plus",
  );
  assert.equal(u.status, "ok");
  assert.equal(u.plan, "pro");
  assert.deepEqual(
    u.windows.map((w) => [w.label, w.utilization, w.resets_at]),
    [
      ["5時間", 15, "2024-12-28T16:00:00.000Z"],
      ["週", 5, "2025-01-03T16:00:00.000Z"],
    ],
  );
  assert.deepEqual(u.notes, ["クレジット残り 150"]);
});

test("Copilot: プレミアムリクエストの使った数と率、無制限は補足に、契約がなければ unavailable", () => {
  const u = parseCopilotUsage({
    login: "octo",
    copilot_plan: "individual",
    quota_reset_date: "2026-12-01",
    quota_snapshots: {
      premium_interactions: { entitlement: 300, remaining: 180, percent_remaining: 60, unlimited: false },
      chat: { unlimited: true },
    },
  });
  assert.equal(u.status, "ok");
  assert.deepEqual(
    u.windows.map((w) => [w.key, w.utilization, w.detail, w.resets_at]),
    [["premium_interactions", 40, "120 / 300 回", "2026-12-01T00:00:00.000Z"]],
  );
  assert.deepEqual(u.notes, ["チャット: 無制限"]);
  assert.equal(parseCopilotUsage({ login: "octo", access_type_sku: "no_access", copilot_plan: "individual" }).status, "unavailable");
  assert.equal(parseCopilotUsage({ access_type_sku: "subscription_ended" }).message, "Copilot の契約が終わっています");
});

test("Cursor: 今月の合計・Auto・モデルを指定と、金額（セント）とオンデマンド", () => {
  const u = parseCursorUsage(
    {
      billingCycleEnd: "2026-11-27T16:32:09.042Z",
      membershipType: "pro",
      individualUsage: {
        plan: { used: 320, limit: 2000, totalPercentUsed: 16, autoPercentUsed: 10, apiPercentUsed: 22 },
        onDemand: { enabled: true, used: 150, limit: 1000 },
      },
    },
    "a@example.com",
  );
  assert.deepEqual(
    u.windows.map((w) => [w.key, w.utilization, w.detail ?? null]),
    [
      ["total", 16, "$3.20 / $20.00"],
      ["auto", 10, null],
      ["api", 22, null],
    ],
  );
  assert.deepEqual(u.notes, ["オンデマンド $1.50 / $10.00"]);
  assert.equal(u.windows[0].resets_at, "2026-11-27T16:32:09.042Z");
});

test("Gemini: モデルの段階ごとに、いちばん残りが少ないものを使用率にする。契約の名前と、個人向けの終了", () => {
  const u = parseGeminiQuota(
    {
      buckets: [
        { modelId: "gemini-2.5-pro", remainingFraction: 0.8, resetTime: "2026-11-03T00:00:00Z" },
        { modelId: "gemini-3-pro-preview", remainingFraction: 0.25, resetTime: "2026-11-03T01:00:00Z" },
        { modelId: "gemini-2.5-flash", remainingFraction: 1 },
        { modelId: "gemini-2.5-flash-lite", remainingFraction: 0.5 },
      ],
    },
    "Paid",
    null,
  );
  assert.deepEqual(
    u.windows.map((w) => [w.label, w.utilization, w.resets_at]),
    [
      ["Pro", 75, "2026-11-03T01:00:00.000Z"],
      ["Flash Lite", 50, null],
      ["Flash", 0, null],
    ],
  );
  assert.equal(geminiPlan({ paidTier: { name: "Gemini Code Assist Standard" }, currentTier: { id: "standard-tier" } }, false), "Gemini Code Assist Standard");
  assert.equal(geminiPlan({ currentTier: { id: "free-tier" } }, true), "Workspace");
  assert.equal(isConsumerShutdown({ ineligibleTiers: [{ reasonCode: "UNSUPPORTED_CLIENT" }] }), true);
  assert.equal(isConsumerShutdown({ currentTier: { id: "standard-tier" }, ineligibleTiers: [{ reasonCode: "UNSUPPORTED_CLIENT" }] }), false);
});

test("Claude: いつもの使用枠を同じ形にする。取れなければ unavailable、失敗の理由は添える", () => {
  const win = (key: string, label: string, utilization: number | null) => ({ key, label, utilization, resets_at: null });
  const usage: PlanUsage = {
    provider: "claude",
    provider_label: "Claude",
    available: true,
    plan: "max",
    five_hour: win("five_hour", "5時間", null),
    seven_day: win("seven_day", "週", 42),
    model_weekly: [win("model:Fable", "週（Fable）", 48)],
    fetched_at: "2026-11-02T00:00:00.000Z",
  };
  const u = claudeServiceUsage(usage);
  assert.equal(u.status, "ok");
  assert.deepEqual(u.windows.map((w) => w.label), ["5時間", "週", "週（Fable）"]);
  assert.equal(claudeServiceUsage({ ...usage, error: "timeout" }).message, "最新の取得に失敗: timeout");
  assert.equal(claudeServiceUsage({ ...usage, available: false }).status, "unavailable");
});

test("JWT の中身を読む（壊れていれば null）", () => {
  const token = `x.${Buffer.from(JSON.stringify({ exp: 1, email: "a@b" })).toString("base64url")}.y`;
  assert.deepEqual(jwtClaims(token), { exp: 1, email: "a@b" });
  assert.equal(jwtClaims("broken"), null);
});
