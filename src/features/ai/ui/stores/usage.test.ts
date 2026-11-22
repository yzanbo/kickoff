import assert from "node:assert/strict";
import { test } from "vitest";
import type { ProviderUsage } from "@shared/ai/usage";
import { publishServerEvent } from "@/foundation/ui/api/events";
import { usageStore } from "./usage";

test("1 分ごとの使用状況の通知は、下の帯と詳細が共有する値を更新する（ほかの AI の知らせでは変えない）", () => {
  const initial: ProviderUsage = {
    provider: "claude", status: "ok", plan: "max", account: null,
    windows: [
      { key: "five_hour", label: "5時間", utilization: 10, resets_at: null },
      { key: "seven_day", label: "週", utilization: 20, resets_at: null },
    ],
    notes: [], pay_as_you_go: null, fetched_at: "2026-11-17T00:00:00Z",
  };
  usageStore.set(initial);
  const updated = { ...initial, windows: [initial.windows[0]!, { ...initial.windows[1]!, utilization: 30 }], fetched_at: "2026-11-17T00:01:00Z" };
  let notifications = 0;
  const unsubscribe = usageStore.subscribe(() => notifications++);
  try {
    publishServerEvent({ type: "usage", usage: updated });
    assert.equal(usageStore.get().data, updated);
    assert.equal(notifications, 1);
    publishServerEvent({ type: "usage", usage: { ...updated, provider: "codex" } });
    assert.equal(usageStore.get().data, updated);
  } finally {
    unsubscribe();
  }
});
