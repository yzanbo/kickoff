import assert from "node:assert/strict";
import { test } from "vitest";
import { parseCodexUsage } from "./codex/usage";
import { jwtClaims } from "./shared/http";
import { parseCopilotUsage } from "./copilot/usage";
import { realUsageFetchers } from "./usageFetchers";

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
  assert.deepEqual(u.pay_as_you_go, { enabled: true, unlimited: false, balance: 150, utilization: null, used: null, limit: null, currency: null, spending: null, checked_at: null });
  // 残りが数の文字でも読む。クレジットの情報がなければ null
  assert.equal(parseCodexUsage({ credits: { has_credits: true, balance: "12.5" } }, null, null).pay_as_you_go?.balance, 12.5);
  assert.equal(parseCodexUsage({}, null, null).pay_as_you_go, null);
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

test("Cursor と Gemini は枠を返さず、公式の確認先を案内する", async () => {
  const fetchers = realUsageFetchers(async () => null);
  for (const [id, guide] of [["cursor", "ダッシュボード"], ["gemini", "Google AI Studio"]] as const) {
    const usage = await fetchers[id]();
    assert.equal(usage.provider, id);
    assert.equal(usage.status, "unavailable");
    assert.deepEqual(usage.windows, []);
    assert.match(usage.message ?? "", new RegExp(guide));
  }
});

test("JWT の中身を読む（壊れていれば null）", () => {
  const token = `x.${Buffer.from(JSON.stringify({ exp: 1, email: "a@b" })).toString("base64url")}.y`;
  assert.deepEqual(jwtClaims(token), { exp: 1, email: "a@b" });
  assert.equal(jwtClaims("broken"), null);
});
