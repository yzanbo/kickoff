import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "vitest";
import type { StallRecord } from "@/foundation/core/system/stallWatch";
import { tempDir } from "@/foundation/core/testing/tempDir";
import type { BootRecord } from "@/foundation/desktop/diagnostics/bootTimeline";
import { lastLaunch, parseJsonl, readLogOverview, summarizeStalls } from "./logOverview";

const now = new Date("2026-11-16T12:00:00.000Z");

const stall = (over: Partial<StallRecord>): StallRecord => ({
  at: "2026-11-16T11:00:00.000Z",
  process: "main",
  pid: 1,
  blockedMs: 600,
  task: null,
  taskMs: null,
  cpuMs: 590,
  gcMs: 0,
  kind: "blocked",
  rssMB: 200,
  ...over,
});

const boot = (over: Partial<BootRecord>): BootRecord => ({
  at: "2026-11-16T10:00:01.400Z",
  window: "main",
  origin: "mainStart",
  originAt: Date.parse("2026-11-16T10:00:00.000Z"),
  stages: [
    { name: "mainStart", ms: 0 },
    { name: "firstPaint", ms: 950 },
    { name: "interactive", ms: 1310 },
  ],
  timedOut: false,
  assets: null,
  app: { name: "Kickoff Dev", version: "0.1.0", electron: "45.2.1", packaged: false },
  openedAtLogin: false,
  ...over,
});

test("parseJsonl: 空の行・書きかけの行を飛ばす", () => {
  assert.deepEqual(parseJsonl('{"a":1}\n\n{"b":\n{"c":3}\n'), [{ a: 1 }, { c: 3 }]);
});

test("summarizeStalls: 最近 24 時間の blocked だけを数え、まとめた行は repeat の数で数える", () => {
  const rows = [
    stall({ at: "2026-11-15T11:59:59.000Z", blockedMs: 9000 }), // 24 時間より前
    stall({ kind: "throttled", blockedMs: 8000 }), // 間引かれただけ
    stall({ blockedMs: 700, task: "ipc:diagnostics.start", repeat: 3 }),
    stall({ process: "core", blockedMs: 1200, task: "sqlite:select chat_events", at: "2026-11-16T09:30:00.000Z" }),
    { broken: true },
  ];
  const result = summarizeStalls(rows, now);
  assert.equal(result.count, 4);
  assert.deepEqual(result.longest.main, { at: "2026-11-16T11:00:00.000Z", blockedMs: 700, task: "ipc:diagnostics.start" });
  assert.deepEqual(result.longest.core, { at: "2026-11-16T09:30:00.000Z", blockedMs: 1200, task: "sqlite:select chat_events" });
});

test("summarizeStalls: プロセスごとにいちばん長いものを選び、なければ null", () => {
  const result = summarizeStalls([stall({ blockedMs: 600 }), stall({ blockedMs: 2500, task: "boot:seedDevData" }), stall({ blockedMs: 900 })], now);
  assert.equal(result.count, 3);
  assert.equal(result.longest.main?.blockedMs, 2500);
  assert.equal(result.longest.core, null);
  assert.deepEqual(summarizeStalls([], now), { count: 0, longest: { main: null, core: null } });
});

test("lastLaunch: メインの始まりを起点にした最後の行を使い、読み込み直し・別ウィンドウの行は飛ばす", () => {
  const rows = [
    boot({ originAt: Date.parse("2026-11-15T08:00:00.000Z") }),
    boot({}),
    boot({ origin: "rendererStart", originAt: Date.parse("2026-11-16T11:00:00.000Z") }),
    boot({ window: "popout", origin: "rendererStart" }),
  ];
  assert.deepEqual(lastLaunch(rows), { startedAt: "2026-11-16T10:00:00.000Z", firstPaintMs: 950, interactiveMs: 1310, timedOut: false });
});

test("lastLaunch: 取れなかった段階は null・10 秒でそろわなければ timedOut・行がなければ null", () => {
  assert.deepEqual(lastLaunch([boot({ stages: [{ name: "mainStart", ms: 0 }], timedOut: true })]), {
    startedAt: "2026-11-16T10:00:00.000Z",
    firstPaintMs: null,
    interactiveMs: null,
    timedOut: true,
  });
  assert.equal(lastLaunch([]), null);
});

test("readLogOverview: 回した 1 世代（.1）と今のファイルをつないで読み、ファイルがなくても返す", async () => {
  const dir = tempDir();
  assert.deepEqual(await readLogOverview(dir, now), { logsDir: dir, stalls: { count: 0, longest: { main: null, core: null } }, lastBoot: null });
  writeFileSync(path.join(dir, "stalls.jsonl.1"), `${JSON.stringify(stall({ blockedMs: 3000 }))}\n`);
  writeFileSync(path.join(dir, "stalls.jsonl"), `${JSON.stringify(stall({ blockedMs: 800 }))}\n`);
  writeFileSync(path.join(dir, "boot.jsonl.1"), `${JSON.stringify(boot({}))}\n`);
  const overview = await readLogOverview(dir, now);
  assert.equal(overview.stalls.count, 2);
  assert.equal(overview.stalls.longest.main?.blockedMs, 3000);
  assert.equal(overview.lastBoot?.interactiveMs, 1310);
});
