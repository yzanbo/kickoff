import { test, vi } from "vitest";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess, spawn } from "node:child_process";
import { watchSandboxLog } from "./macosSandboxLogStream";
import { sandboxDenials } from "./macosSandboxDiagnostics";

function setup() {
  vi.useFakeTimers();
  const child = Object.assign(new EventEmitter(), { pid: 123, stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn((_signal: string) => { queueMicrotask(() => child.emit("close", null)); return true; }) });
  const start = vi.fn(() => child as unknown as ChildProcess);
  const entries: unknown[] = [];
  const failed = vi.fn();
  const controller = new AbortController();
  const open = () => watchSandboxLog(controller.signal, sandboxDenials, (e) => entries.push(e), failed, start as unknown as typeof spawn);
  return { child, start, entries, failed, controller, open };
}

test("ライブ収集は固定の読み取りだけ。構造化した結果だけを渡し、閉じたらプロセス・タイマーを残さない", async () => {
  const s = setup();
  try {
    const pending = s.open();
    await vi.advanceTimersByTimeAsync(200);
    const close = await pending;
    const [file, args] = s.start.mock.calls[0] as unknown as [string, string[]];
    assert.equal(file, "/usr/bin/log");
    assert.equal(args[0], "stream");
    assert.ok(args.includes("2m"));
    assert.ok(args.includes("--no-backtrace"));
    assert.equal(args[args.indexOf("--type") + 1], "log");
    s.child.stdout.write(JSON.stringify({ eventMessage: "Sandbox: node(321) deny(1) mach-lookup com.apple.FSEvents", processImagePath: "/kernel", timestamp: "2026-11-17T00:00:00Z" }) + "\n");
    assert.equal(s.entries.length, 1);
    assert.equal(s.failed.mock.calls.length, 0);
    await close();
    await close();
    assert.equal(s.child.kill.mock.calls.length, 1);
    assert.equal(vi.getTimerCount(), 0);
  } finally { vi.useRealTimers(); }
});

test("起動直後の拒否、壊れた出力、出力上限、予期しない終了を、空の結果と取り違えない", async () => {
  for (const kind of ["startup", "invalid", "overflow", "exit"]) {
    const s = setup();
    try {
      const pending = s.open();
      if (kind === "startup") {
        s.child.stderr.write("Cannot run while sandboxed secret\n");
        s.child.emit("close", 1);
        await assert.rejects(pending, /読み取れません/);
      } else {
        await vi.advanceTimersByTimeAsync(200);
        const close = await pending;
        if (kind === "invalid") s.child.stdout.write("壊れた出力\n");
        if (kind === "overflow") s.child.stderr.write("x".repeat(1024 * 1024 + 1));
        if (kind === "exit") s.child.emit("close", 1);
        await close();
      }
      assert.ok(s.failed.mock.calls.length > 0);
      assert.equal(s.entries.length, 0);
      assert.equal(vi.getTimerCount(), 0);
    } finally { vi.useRealTimers(); }
  }
});

test("実行中断でも収集を止め、SIGTERM で止まらない場合は SIGKILL まで行う", async () => {
  const s = setup();
  try {
    s.child.kill.mockImplementation((signal) => { if (signal === "SIGKILL") queueMicrotask(() => s.child.emit("close", null)); return true; });
    const pending = s.open();
    await vi.advanceTimersByTimeAsync(200);
    const close = await pending;
    s.controller.abort();
    await vi.advanceTimersByTimeAsync(1000);
    await close();
    assert.deepEqual(s.child.kill.mock.calls.map(([signal]) => signal), ["SIGTERM", "SIGKILL"]);
    assert.equal(s.failed.mock.calls.length, 0);
    assert.equal(vi.getTimerCount(), 0);
  } finally { vi.useRealTimers(); }
});
