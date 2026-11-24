import assert from "node:assert/strict";
import { test } from "vitest";
import { PlannedProvider } from "./planned";
import { parseCopilotUsage } from "./copilot/usage";
import { realUsageFetchers } from "./usageFetchers";

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
  const fetchers = realUsageFetchers(new PlannedProvider("codex", "Codex", "codex"), async () => null);
  for (const [id, guide] of [["cursor", "ダッシュボード"], ["gemini", "Google AI Studio"]] as const) {
    const usage = await fetchers[id]();
    assert.equal(usage.provider, id);
    assert.equal(usage.status, "unavailable");
    assert.deepEqual(usage.windows, []);
    assert.match(usage.message ?? "", new RegExp(guide));
  }
});
