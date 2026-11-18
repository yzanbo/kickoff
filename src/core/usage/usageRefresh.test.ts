import assert from "node:assert/strict";
import { test, vi } from "vitest";
import type { PlanUsage } from "@shared/types";
import { Bus } from "../bus.js";
import type { AgentProvider } from "../providers/index.js";
import { CodexCreditsWatch } from "./codexCredits.js";
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

test("超過分の知らせ: 変わったときだけ配り、取り直しても残し、上限に達した枠がなくなったら外す", async () => {
  let current: PlanUsage = { ...usage(), seven_day: { ...usage().seven_day, utilization: 100 } };
  const provider = { id: "claude", label: "Claude", usage: async () => current } as AgentProvider;
  const bus = new Bus();
  const published: (boolean | undefined)[] = [];
  bus.subscribe((event) => { if (event.type === "usage") published.push(event.usage.overage?.in_use); });
  const monitor = new UsageMonitor(provider, bus);
  await monitor.refresh(true);
  assert.equal((await monitor.get()).overage, null);
  // 動き始めたときだけ true を返し、同じ値の知らせでは配らない
  assert.equal(monitor.noteOverage(true), true);
  assert.equal(monitor.noteOverage(true), false);
  assert.equal((await monitor.get()).overage?.in_use, true);
  // 週の枠が 100% のまま取り直しても、超過分で動いている印は残す
  await monitor.refresh(true);
  assert.equal((await monitor.get()).overage?.in_use, true);
  // 枠がリセットされた（上限に達した枠がない）なら外す
  current = usage();
  await monitor.refresh(true);
  assert.equal((await monitor.get()).overage?.in_use, false);
  // 配ったもの: 初めの取得（印なし）・動き始め・取り直し 2 回（同じ値の 2 回目の知らせは配っていない）
  assert.deepEqual(published, [undefined, true, true, false]);
});

test("Codex のクレジット: 取り直して残りが減っていたら spending を重ね、枠に空きが戻ったら外す", async () => {
  const claude = { get: async () => usage(), refresh: async () => usage() };
  let balance = 150;
  let percent = 100;
  const codex = { id: "codex" as const, label: "Codex", fetch: async () =>
    usageResult({ id: "codex", label: "Codex" }).ok({
      windows: [{ key: "primary", label: "5時間", utilization: percent, resets_at: null }],
      credits: { has_credits: true, unlimited: false, balance, spending: null },
    }) };
  const monitor = new ServiceUsageMonitor(claude, [codex], new CodexCreditsWatch());
  const creditsOf = async () => (await monitor.refresh(true)).find((s) => s.id === "codex")?.credits;
  assert.equal((await creditsOf())?.spending, null);
  balance = 142;
  assert.deepEqual([(await creditsOf())?.spending?.from, (await creditsOf())?.spending?.to], [150, 142]);
  percent = 20;
  assert.equal((await creditsOf())?.spending, null);
});
