import assert from "node:assert/strict";
import { test } from "vitest";
import type { ProviderUsage } from "@shared/ai/usage";
import { callDef, testTurn } from "@/foundation/core/testing/toolCalls";
import { usageText, usageToolGroup } from "./tools";

test("get_usage: 使った割合と残り・リセットの時刻（取れなければその理由）", async () => {
  const usage: ProviderUsage = {
    provider: "claude",
    status: "ok",
    plan: "Max",
    account: null,
    windows: [
      { key: "five_hour", label: "5 時間", utilization: 42.4, resets_at: "2026-11-13T15:00:00Z" },
      { key: "model:Fable", label: "週（Fable）", utilization: 10, resets_at: null },
    ],
    notes: [],
    pay_as_you_go: null,
    fetched_at: "2026-11-13T12:00:00Z",
  };
  const text = usageText(usage);
  assert.equal(
    text,
    [
      "Claude のプランの使用枠（2026-11-13T12:00:00Z に取得・プラン Max）:",
      "- 5 時間: 42% 使用（残り 58%）・2026-11-13T15:00:00Z にリセット",
      "- 週: まだ始まっていません",
      "- 週（Fable）: 10% 使用（残り 90%）",
      "- 追加の使用枠: 不明（Claude から追加の使用枠の情報が返っていません）",
    ].join("\n"),
  );
  assert.match(usageText({ ...usage, status: "error", windows: [], message: "API キー" }), /取得できません（API キー）/);
  assert.match(usageText({ ...usage, status: "unavailable", windows: [] }), /取得できません（API キーで使っているなど）/);
  assert.match(usageText({ ...usage, error: "timeout" }), /前に取った値です: timeout/);
  const [tool] = usageToolGroup({ current: async () => usage }).open(testTurn()) ?? [];
  assert.equal(await callDef(tool), text);
});
