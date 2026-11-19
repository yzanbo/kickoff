import assert from "node:assert/strict";
import { test } from "vitest";
import type { PlanUsage } from "@shared/types";
import { publishServerEvent } from "@/foundation/ui/api/events";
import { usageStore } from "./usage";

test("1 分ごとの使用状況の通知は、下の帯と詳細が共有する値を更新する", () => {
  const initial: PlanUsage = {
    provider: "claude", provider_label: "Claude", available: true, plan: "max",
    five_hour: { key: "five_hour", label: "5時間", utilization: 10, resets_at: null },
    seven_day: { key: "seven_day", label: "週", utilization: 20, resets_at: null },
    model_weekly: [], fetched_at: "2026-11-17T00:00:00Z",
  };
  usageStore.set(initial);
  const updated = { ...initial, seven_day: { ...initial.seven_day, utilization: 30 }, fetched_at: "2026-11-17T00:01:00Z" };
  let notifications = 0;
  const unsubscribe = usageStore.subscribe(() => notifications++);
  try {
    publishServerEvent({ type: "usage", usage: updated });
    assert.equal(usageStore.get().data, updated);
    assert.equal(notifications, 1);
  } finally {
    unsubscribe();
  }
});
