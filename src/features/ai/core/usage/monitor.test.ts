import assert from "node:assert/strict";
import { test } from "vitest";
import type { PayAsYouGo, ProviderUsage } from "@shared/ai/usage";
import { Bus } from "@/foundation/core/bus";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { UsageMonitor } from "./monitor";

const claude = (patch: Partial<ProviderUsage> = {}): ProviderUsage => ({
  provider: "claude",
  status: "ok",
  plan: "max",
  account: null,
  windows: [
    { key: "five_hour", label: "5時間", utilization: 10, resets_at: null },
    { key: "seven_day", label: "週", utilization: 20, resets_at: null },
  ],
  notes: [],
  pay_as_you_go: null,
  fetched_at: new Date().toISOString(),
  ...patch,
});
const codex = (patch: Partial<ProviderUsage> = {}): ProviderUsage => ({ ...claude(), provider: "codex", windows: [], ...patch });

test("Claude の使用状況を 1 分ごとに取得して下の帯へ知らせ、停止後は取り直さない", async () => {
  const clock = manualClock(Date.parse("2026-11-17T00:00:00Z"));
  let calls = 0;
  const bus = new Bus();
  const events: string[] = [];
  bus.subscribe((event) => {
    if (event.type === "usage") events.push(event.usage.fetched_at);
  });
  const monitor = new UsageMonitor(bus, { claude: async () => (calls++, claude({ fetched_at: clock.iso() })) }, clock);
  try {
    monitor.start();
    await clock.advance(0);
    assert.equal(calls, 1);
    await clock.advance(59_999);
    assert.equal(calls, 1);
    await clock.advance(1);
    assert.equal(calls, 2);
    assert.equal(events.length, 2);
    assert.notEqual(events[0], events[1]);
    monitor.stop();
    await clock.advance(60_000);
    assert.equal(calls, 2);
  } finally {
    monitor.stop();
  }
});

test("Claude の枠: 15 秒以内の続けての取得はまとめ、失敗しても直前の値を残して理由を添える", async () => {
  const clock = manualClock(Date.parse("2026-11-17T00:00:00Z"));
  let fail = false;
  let calls = 0;
  const monitor = new UsageMonitor(
    undefined,
    {
      claude: async () => {
        calls++;
        if (fail) throw new Error("timeout");
        return claude();
      },
    },
    clock,
  );
  await monitor.refresh("claude");
  await monitor.refresh("claude");
  assert.equal(calls, 1);
  fail = true;
  const failed = await monitor.refresh("claude", true);
  assert.deepEqual([calls, failed.status, failed.error, failed.windows.length], [2, "ok", "timeout", 2]);
  assert.equal((await monitor.current("claude")).error, "timeout");
  // 前の値がなければ失敗として出す
  const empty = new UsageMonitor(undefined, { claude: async () => Promise.reject(new Error("boom")) }, clock);
  assert.deepEqual([(await empty.current("claude")).status, (await empty.current("claude")).message], ["error", "boom"]);
});

test("Codex などの使用状況は 1 分以内は共有し、1 分後に取り直す", async () => {
  const clock = manualClock(Date.parse("2026-11-17T00:00:00Z"));
  let calls = 0;
  const monitor = new UsageMonitor(undefined, { claude: async () => claude(), codex: async () => (calls++, codex()) }, clock);
  await Promise.all([monitor.all(), monitor.all()]);
  assert.equal(calls, 1);
  await clock.advance(59_999);
  await monitor.all();
  assert.equal(calls, 1);
  await clock.advance(1);
  await monitor.all();
  assert.equal(calls, 2);
});

test("サービスの取得が遅くても、取得開始から 1 分後にはキャッシュを更新する。1 つが失敗してもほかは出す", async () => {
  const clock = manualClock(Date.parse("2026-11-17T00:00:00Z"));
  let calls = 0;
  const monitor = new UsageMonitor(
    undefined,
    {
      claude: async () => claude(),
      codex: async () => {
        calls++;
        if (calls === 1) await clock.sleep(5_000);
        return codex();
      },
      cursor: async () => Promise.reject(new Error("つながりません")),
    },
    clock,
  );
  const initial = monitor.refreshAll(true);
  await clock.advance(5_000);
  assert.deepEqual(
    (await initial).map((s) => [s.provider, s.status, s.message ?? null]),
    [
      ["claude", "ok", null],
      ["codex", "ok", null],
      ["cursor", "error", "取得できませんでした（つながりません）"],
    ],
  );
  await clock.advance(55_000);
  await monitor.all();
  assert.equal(calls, 2);
});

test("超過分の知らせ: 変わったときだけ配り、取り直しても残し、上限に達した枠がなくなったら外す", async () => {
  let current = claude({ windows: [{ key: "five_hour", label: "5時間", utilization: 10, resets_at: null }, { key: "seven_day", label: "週", utilization: 100, resets_at: null }] });
  const bus = new Bus();
  const published: (boolean | undefined)[] = [];
  /** 超過分で動いているか（まだ知らされていなければ undefined） */
  const inUse = (u: ProviderUsage) => (u.pay_as_you_go?.checked_at ? u.pay_as_you_go.spending !== null : undefined);
  bus.subscribe((event) => {
    if (event.type === "usage") published.push(inUse(event.usage));
  });
  const monitor = new UsageMonitor(bus, { claude: async () => current });
  await monitor.refresh("claude", true);
  assert.equal(inUse(await monitor.current("claude")), undefined);
  // 動き始めたときだけ true を返し、同じ値の知らせでは配らない
  assert.equal(monitor.noteSpending("claude", { in_use: true }), true);
  assert.equal(monitor.noteSpending("claude", { in_use: true }), false);
  assert.equal(inUse(await monitor.current("claude")), true);
  // 週の枠が 100% のまま取り直しても、超過分で動いている印は残す
  await monitor.refresh("claude", true);
  assert.equal(inUse(await monitor.current("claude")), true);
  // 枠がリセットされた（上限に達した枠がない）なら外す
  current = claude();
  await monitor.refresh("claude", true);
  assert.equal(inUse(await monitor.current("claude")), false);
  // 配ったもの: 初めの取得（印なし）・動き始め・取り直し 2 回（同じ値の 2 回目の知らせは配っていない）
  assert.deepEqual(published, [undefined, true, true, false]);
});

test("Codex のクレジット: 取り直して残りが減っていたら spending を重ね、枠に空きが戻ったら外す。実行中の知らせと同じ見張りで、変わったら配る", async () => {
  let balance = 150;
  let percent = 100;
  const bus = new Bus();
  const published: PayAsYouGo["spending"][] = [];
  bus.subscribe((event) => {
    if (event.type === "usage") published.push(event.usage.pay_as_you_go?.spending ?? null);
  });
  const pay = () => ({ enabled: true, unlimited: false, balance, utilization: null, used: null, limit: null, currency: null, spending: null, checked_at: null });
  const monitor = new UsageMonitor(bus, { codex: async () => codex({ windows: [{ key: "primary", label: "5時間", utilization: percent, resets_at: null }], pay_as_you_go: pay() }) });
  const creditsOf = async () => (await monitor.refreshAll(true)).find((s) => s.provider === "codex")?.pay_as_you_go;
  assert.equal((await creditsOf())?.spending, null);
  balance = 142;
  assert.deepEqual([(await creditsOf())?.spending?.from, (await creditsOf())?.spending?.to], [150, 142]);
  // 実行中の知らせでさらに減った: 引かれ始めたとはもう返さない
  assert.equal(monitor.noteSpending("codex", { has_credits: true, unlimited: false, balance: 130, limit_reached: true }), false);
  percent = 20;
  balance = 130;
  assert.equal((await creditsOf())?.spending, null);
  assert.deepEqual(published, [null, { since: published[1]?.since, from: 150, to: 142 }, { since: published[1]?.since, from: 150, to: 130 }, null]);
});

test("使い切った枠の戻る時刻: その AI の取った値から（まだなければ取る）。取れなければ null", async () => {
  const monitor = new UsageMonitor(undefined, {
    claude: async () => claude({ windows: [{ key: "five_hour", label: "5時間", utilization: 100, resets_at: "2026-11-17T05:00:00Z" }] }),
    codex: async () => Promise.reject(new Error("x")),
  });
  assert.equal(await monitor.limitResetAt("claude"), "2026-11-17T05:00:00Z");
  assert.equal(await monitor.limitResetAt("codex"), null);
});

test("「更新」（force）は、進んでいるふつうの取得に相乗りせず、Claude の枠も取り直す", async () => {
  const clock = manualClock(Date.parse("2026-11-17T00:00:00Z"));
  let claudeCalls = 0;
  let codexCalls = 0;
  const monitor = new UsageMonitor(
    undefined,
    {
      claude: async () => (claudeCalls++, claude()),
      codex: async () => {
        codexCalls++;
        await clock.sleep(5_000);
        return codex();
      },
    },
    clock,
  );
  await monitor.refresh("claude");
  // 設定を開いた（Claude はとっておいた値・Codex は取りに行って遅い）ところで「更新」を押す
  const opened = monitor.all();
  const refreshed = monitor.refreshAll(true);
  await clock.advance(5_000);
  await Promise.all([opened, refreshed]);
  assert.deepEqual([claudeCalls, codexCalls], [2, 2]);
});

test("1 分以内の一覧でも、そのあとに取り直した・知らせを重ねた AI は最新の値を返す（SSE の usage と同じ値）", async () => {
  const clock = manualClock(Date.parse("2026-11-17T00:00:00Z"));
  let percent = 10;
  const monitor = new UsageMonitor(
    undefined,
    {
      claude: async () => claude({ windows: [{ key: "five_hour", label: "5時間", utilization: percent, resets_at: null }] }),
      codex: async () => codex({ pay_as_you_go: { enabled: true, unlimited: false, balance: 150, utilization: null, used: null, limit: null, currency: null, spending: null, checked_at: null } }),
    },
    clock,
  );
  await monitor.all();
  percent = 30;
  await monitor.refresh("claude", true);
  monitor.noteSpending("codex", { has_credits: true, unlimited: false, balance: 140, limit_reached: true });
  const [c, x] = await monitor.all();
  assert.deepEqual([c?.windows[0]?.utilization, x?.pay_as_you_go?.balance, x?.pay_as_you_go?.spending?.to], [30, 140, 140]);
});
