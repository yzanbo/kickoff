import assert from "node:assert/strict";
import { test, vi } from "vitest";
import type { PlanUsage } from "@shared/types";
import { Bus } from "../bus.js";
import type { AgentProvider } from "../providers/index.js";
import { UsageMonitor } from "./planUsage.js";
import { ServiceUsageMonitor } from "./services/index.js";
import { usageResult } from "./services/common.js";

const usage = (): PlanUsage => ({
  provider: "claude", provider_label: "Claude", available: true, plan: "max",
  five_hour: { key: "five_hour", label: "5時間", utilization: 10, resets_at: null },
  seven_day: { key: "seven_day", label: "週", utilization: 20, resets_at: null },
  model_weekly: [], fetched_at: new Date().toISOString(),
});

test("Claude の使用状況を 1 分ごとに取得して下の帯へ知らせ、停止後は取り直さない", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-17T00:00:00Z"));
  let calls = 0;
  const provider = { id: "claude", label: "Claude", usage: async () => { calls++; return usage(); } } as AgentProvider;
  const bus = new Bus();
  const events: string[] = [];
  bus.subscribe((event) => { if (event.type === "usage") events.push(event.usage.fetched_at); });
  const monitor = new UsageMonitor(provider, bus);
  try {
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    assert.equal(calls, 1);
    await vi.advanceTimersByTimeAsync(59_999);
    assert.equal(calls, 1);
    await vi.advanceTimersByTimeAsync(1);
    assert.equal(calls, 2);
    assert.equal(events.length, 2);
    assert.notEqual(events[0], events[1]);
    monitor.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    assert.equal(calls, 2);
  } finally {
    monitor.stop();
  }
});

test("Codex などの使用状況は 1 分以内は共有し、1 分後に取り直す", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-17T00:00:00Z"));
  const claude = { get: async () => usage(), refresh: async () => usage() };
  let calls = 0;
  const codex = { id: "codex" as const, label: "Codex", fetch: async () => {
    calls++;
    return usageResult({ id: "codex", label: "Codex" }).ok({});
  } };
  const monitor = new ServiceUsageMonitor(claude, [codex]);
  await Promise.all([monitor.get(), monitor.get()]);
  assert.equal(calls, 1);
  await vi.advanceTimersByTimeAsync(59_999);
  await monitor.get();
  assert.equal(calls, 1);
  await vi.advanceTimersByTimeAsync(1);
  await monitor.get();
  assert.equal(calls, 2);
});

test("サービスの取得が遅くても、取得開始から 1 分後にはキャッシュを更新する", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-17T00:00:00Z"));
  const claude = { get: async () => usage(), refresh: async () => usage() };
  let calls = 0;
  const codex = { id: "codex" as const, label: "Codex", fetch: async () => {
    calls++;
    if (calls === 1) await new Promise((resolve) => setTimeout(resolve, 5_000));
    return usageResult({ id: "codex", label: "Codex" }).ok({});
  } };
  const monitor = new ServiceUsageMonitor(claude, [codex]);
  const initial = monitor.get();
  await vi.advanceTimersByTimeAsync(5_000);
  await initial;
  await vi.advanceTimersByTimeAsync(55_000);
  await monitor.get();
  assert.equal(calls, 2);
});
