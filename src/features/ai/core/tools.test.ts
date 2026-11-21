import assert from "node:assert/strict";
import { test } from "vitest";
import type { PlanUsage } from "@shared/ai/types";
import { callDef, testTurn } from "@/foundation/core/testing/toolCalls";
import { usageText, usageToolGroup } from "./tools";

test("get_usage: 使った割合と残り・リセットの時刻（取れなければその理由）", async () => {
  const usage: PlanUsage = {
    provider: "claude",
    provider_label: "Claude",
    available: true,
    plan: "Max",
    five_hour: { key: "five_hour", label: "5 時間", utilization: 42.4, resets_at: "2026-11-13T15:00:00Z" },
    seven_day: { key: "seven_day", label: "週", utilization: null, resets_at: null },
    model_weekly: [],
    fetched_at: "2026-11-13T12:00:00Z",
  };
  const text = usageText(usage);
  assert.match(text, /5 時間: 42% 使用（残り 58%）・2026-11-13T15:00:00Z にリセット/);
  assert.match(text, /週: まだ始まっていません/);
  assert.match(usageText({ ...usage, available: false, error: "API キー" }), /取得できません（API キー）/);
  const [tool] = usageToolGroup({ planUsage: async () => usage }).open(testTurn()) ?? [];
  assert.equal(await callDef(tool), text);
});
