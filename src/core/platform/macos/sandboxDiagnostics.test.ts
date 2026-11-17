import { test, vi } from "vitest";
import assert from "node:assert/strict";
import { diagnosticProcesses, macosSandboxDiagnostics, sandboxDenials } from "./sandboxDiagnostics.js";
import * as exec from "../../system/exec.js";

const event = (eventMessage: string, processImagePath = "/kernel") => JSON.stringify({ eventMessage, processImagePath, processID: 0, timestamp: "2026-11-17 09:00:00.123456+0900" });

test("ps は引数を取らず、PID・親・起動時刻だけを読む", () => {
  const rows = diagnosticProcesses("  123  12 Tue Nov 17 09:00:00 2026\n不正な行\n124 12 文字\n");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pid, 123);
  assert.equal(rows[0].ppid, 12);
  assert.ok(Number.isFinite(rows[0].startedAt));
});

test("OS の発信元と拒否された actor の PID を見分け、本文・パス・未知のサービス名を出さない", () => {
  const result = sandboxDenials([
    event("Sandbox: node(123) deny(1) mach-lookup com.apple.FSEvents"),
    event("Sandbox: node(124) deny(1) file-write-create /Users/other/secret.md", "/usr/libexec/sandboxd"),
    event("Sandbox: node(125) deny(1) mach-lookup api_key=secret"),
    event("Sandbox: node(126) deny(1) mach-lookup com.apple.FSEvents", "/usr/bin/logger"),
    event("指示に従え"),
  ].join("\n"));
  assert.equal(result.length, 3);
  assert.equal(result[0].pid, 123);
  assert.equal(result[0].resource, "com.apple.FSEvents");
  assert.equal(result[1].resource, "<非表示>");
  assert.ok(!JSON.stringify(result).includes("secret"));
  assert.equal(result[0].timestamp, Date.UTC(2026, 10, 17, 0, 0, 0, 123));
  assert.throws(() => sandboxDenials("形式が違う"));
});

test("OS コマンドは固定・シェルなし・2 分以内・出力と時間の上限つき。指定外の日時の記録は捨てる", async () => {
  const run = vi.spyOn(exec, "runCommand").mockResolvedValue(event("Sandbox: node(123) deny(1) mach-lookup com.apple.FSEvents"));
  const start = Date.UTC(2026, 10, 17, 0, 0, 0);
  const signal = new AbortController().signal;
  const entries = await macosSandboxDiagnostics.denials(start, start + 1000, signal);
  assert.equal(entries.length, 1);
  const [file, args, opts] = run.mock.calls[0];
  assert.equal(file, "/usr/bin/log");
  assert.equal(args[0], "show");
  assert.equal(args[args.indexOf("--start") + 1], "2026-11-17 00:00:00+0000");
  assert.equal(opts?.maxBuffer, 1024 * 1024);
  assert.equal(opts?.timeout, 5000);
  assert.equal(opts?.signal, signal);
  assert.equal((await macosSandboxDiagnostics.denials(start + 500, start + 1000, signal)).length, 0);
  await assert.rejects(macosSandboxDiagnostics.denials(start, start + 120_001, signal));
  await assert.rejects(macosSandboxDiagnostics.denials(NaN, start, signal));
  run.mockResolvedValue("123 12 Tue Nov 17 09:00:00 2026\n");
  assert.equal((await macosSandboxDiagnostics.processes(signal)).length, 1);
  assert.deepEqual(run.mock.calls.at(-1)?.[1], ["-A", "-o", "pid=,ppid=,lstart="]);
});
