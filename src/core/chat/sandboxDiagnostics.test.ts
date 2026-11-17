import { test, vi } from "vitest";
import assert from "node:assert/strict";
import { TurnSandboxDiagnostics } from "./sandboxDiagnostics.js";
import type { DiagnosticProcess, SandboxDenial } from "../platform/sandboxDiagnostics.js";

const BASE = Date.UTC(2026, 10, 17, 0, 0, 0);
const processRow = (pid: number, ppid: number, startedAt = BASE): DiagnosticProcess => ({ pid, ppid, startedAt });
const denial = (pid: number, timestamp = BASE + 100): SandboxDenial => ({ pid, timestamp, operation: "mach-lookup", resource: "com.apple.FSEvents" });

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
  let rows = [processRow(10, 1), processRow(11, 10), processRow(20, 1), processRow(21, 20)];
  let entries = [denial(11), denial(21)];
  const processes = vi.fn(async (_signal: AbortSignal) => rows);
  const denials = vi.fn(async (_start: number, _end: number, _signal: AbortSignal) => entries);
  const scope = new TurnSandboxDiagnostics({ processes, denials });
  scope.onSpawn(10);
  return { scope, processes, denials, rows: (value: DiagnosticProcess[]) => { rows = value; }, entries: (value: SandboxDenial[]) => { entries = value; } };
}

test("自分の子と両端で確認できた期間だけを返す。他チャット・開始前・未確認の時間は返さない", async () => {
  const s = setup();
  try {
    assert.equal(JSON.parse(await s.scope.read()).status, "unavailable");
    assert.equal(JSON.parse(await s.scope.start()).status, "capturing");
    await vi.advanceTimersByTimeAsync(300);
    s.entries([denial(11), denial(21), denial(999), denial(11, BASE - 1), denial(11, BASE + 299)]);
    // 子は読み取る前に終了していても、観測できた期間の記録は残す
    s.rows([processRow(10, 1), processRow(20, 1)]);
    const result = JSON.parse(await s.scope.read());
    assert.equal(result.status, "ok");
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].pid, 11);
    assert.equal(s.denials.mock.calls[0][0], BASE);
    assert.equal(s.denials.mock.calls[0][1], BASE + 300);
    assert.equal(JSON.parse(await s.scope.read()).status, "unavailable");
    assert.equal(vi.getTimerCount(), 0);
  } finally { s.scope.close(); vi.useRealTimers(); }
});

test("短命で一度しか見ていないプロセスは返さず、該当なしと取得不可を分ける", async () => {
  const s = setup();
  try {
    await s.scope.start();
    s.rows([processRow(10, 1)]);
    await vi.advanceTimersByTimeAsync(300);
    assert.equal(JSON.parse(await s.scope.read()).status, "no_matching_entries");
    s.processes.mockRejectedValue(new Error("秘密のパス /Users/other/secret"));
    const result = await s.scope.start();
    assert.equal(JSON.parse(result).status, "unavailable");
    assert.ok(!result.includes("secret"));
    assert.equal(vi.getTimerCount(), 0);
  } finally { s.scope.close(); vi.useRealTimers(); }
});

test("PID が同じでも、別の起動時刻・別の親になったあとの記録は混ぜない", async () => {
  const s = setup();
  try {
    await s.scope.start();
    await vi.advanceTimersByTimeAsync(300);
    s.rows([processRow(10, 1), processRow(11, 20, BASE + 1000), processRow(20, 1)]);
    await vi.advanceTimersByTimeAsync(1000);
    s.entries([denial(11, BASE + 1100)]);
    assert.equal(JSON.parse(await s.scope.read()).status, "no_matching_entries");
    // 根の PID 自体が再利用された場合も対象にしない
    s.rows([processRow(10, 1, BASE + 1000), processRow(11, 10, BASE + 1000)]);
    assert.equal(JSON.parse(await s.scope.start()).status, "unavailable");
  } finally { s.scope.close(); vi.useRealTimers(); }
});

test("OS ログの取得失敗は該当なしではなく取得不可。標準エラーを AI に出さない", async () => {
  const s = setup();
  try {
    await s.scope.start();
    await vi.advanceTimersByTimeAsync(300);
    s.denials.mockRejectedValue(new Error("Cannot run while sandboxed /Users/other/api_key=secret"));
    const result = await s.scope.read();
    assert.equal(JSON.parse(result).status, "unavailable");
    assert.ok(!result.includes("secret"));
    assert.ok(!result.includes("/Users"));
  } finally { s.scope.close(); vi.useRealTimers(); }
});

test("2 分で自動終了する。明示終了・再開始・実行終了でもタイマーと読み取りを残さない", async () => {
  const s = setup();
  try {
    await s.scope.start();
    await s.scope.start();
    assert.equal(vi.getTimerCount(), 2);
    await vi.advanceTimersByTimeAsync(120_500);
    assert.equal(vi.getTimerCount(), 0);
    assert.equal(JSON.parse(await s.scope.read()).expired, true);
    assert.equal(s.denials.mock.calls[0][1] - s.denials.mock.calls[0][0], 120_000);
    await s.scope.start();
    s.scope.close();
    assert.equal(vi.getTimerCount(), 0);
    assert.equal(JSON.parse(await s.scope.start()).status, "unavailable");
  } finally { s.scope.close(); vi.useRealTimers(); }
});

test("1 回の結果は 100 件までに制限し、省略を知らせる", async () => {
  const s = setup();
  try {
    await s.scope.start();
    await vi.advanceTimersByTimeAsync(300);
    s.entries(Array.from({ length: 150 }, () => denial(11)));
    const result = JSON.parse(await s.scope.read());
    assert.equal(result.entries.length, 100);
    assert.equal(result.limited, true);
  } finally { s.scope.close(); vi.useRealTimers(); }
});

test("ライブ収集では他チャットの記録を保持せず、読み終わったら収集を閉じる", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
  let entry!: (e: SandboxDenial) => void;
  const stop = vi.fn(async () => {});
  const stored = vi.fn(async () => []);
  const scope = new TurnSandboxDiagnostics({
    processes: async () => [processRow(10, 1), processRow(11, 10)],
    denials: stored,
    watch: async (_signal, onEntry) => { entry = onEntry; return stop; },
  });
  try {
    scope.onSpawn(10);
    await scope.start();
    entry(denial(11));
    entry(denial(21));
    await vi.advanceTimersByTimeAsync(300);
    const result = JSON.parse(await scope.read());
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].pid, 11);
    assert.equal(stored.mock.calls.length, 0);
    assert.ok(stop.mock.calls.length > 0);
  } finally { scope.close(); vi.useRealTimers(); }
});

test("ライブ収集中の取得失敗は該当なしではない。中断時にも収集を止める", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
  let fail!: () => void;
  const stop = vi.fn(async () => {});
  const scope = new TurnSandboxDiagnostics({
    processes: async () => [processRow(10, 1)], denials: async () => [],
    watch: async (_signal, _entry, onFailed) => { fail = () => onFailed("process_exit"); return stop; },
  });
  try {
    scope.onSpawn(10);
    await scope.start();
    fail();
    assert.equal(JSON.parse(await scope.read()).status, "unavailable");
    await scope.start();
    const count = stop.mock.calls.length;
    scope.close();
    assert.ok(stop.mock.calls.length > count);
    assert.equal(vi.getTimerCount(), 0);
  } finally { scope.close(); vi.useRealTimers(); }
});

test("出力上限に達しても、確認済みの拒否は省略の印を付けて返す。空なら取得不可", async () => {
  for (const hasEntry of [true, false]) {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
    let entry!: (e: SandboxDenial) => void;
    let fail!: () => void;
    const scope = new TurnSandboxDiagnostics({
      processes: async () => [processRow(10, 1), processRow(11, 10)], denials: async () => [],
      watch: async (_signal, onEntry, onFailed) => { entry = onEntry; fail = () => onFailed("output_limit"); return async () => {}; },
    });
    try {
      scope.onSpawn(10);
      await scope.start();
      if (hasEntry) entry(denial(11));
      await vi.advanceTimersByTimeAsync(300);
      fail();
      const result = JSON.parse(await scope.read());
      assert.equal(result.status, hasEntry ? "ok" : "unavailable");
      if (hasEntry) assert.equal(result.limited, true);
    } finally { scope.close(); vi.useRealTimers(); }
  }
});
