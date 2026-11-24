import assert from "node:assert/strict";
import { test } from "vitest";
import type { BootReport } from "@shared/foundation/ipc";
import { bootLogLine, buildBootRecord, metricsRow, type MainMarks } from "./bootTimeline";

const app = { name: "Kickoff Dev", version: "0.1.0", electron: "45.2.1", packaged: false };
const at = new Date("2026-11-15T10:00:00.000Z");

const report = (marks: BootReport["marks"], window: BootReport["window"] = "main"): BootReport => ({
  window,
  timeOrigin: 10_500,
  marks,
  assets: { count: 23, refetched: 2, encodedKB: 5400 },
});

test("buildBootRecord: メインの段階と画面の段階を、メインの始まりからの経過にして早い順に並べる", () => {
  const main: MainMarks = {
    mainStart: 10_000,
    mainLoaded: 10_090,
    whenReady: 10_200,
    coreForked: 10_210,
    "core.processStart": 10_230,
    "core.modulesLoaded": 10_300,
    "core.dbOpened": 10_350,
    "core.listening": 10_400,
    coreReady: 10_420,
    windowCreated: 10_480,
    loadStart: 10_490,
  };
  const record = buildBootRecord({ at, report: report({ entry: 10_700, firstCommit: 10_900, firstPaint: 10_950, interactive: 11_310 }), main, withMain: true, app, openedAtLogin: false });
  assert.equal(record.origin, "mainStart");
  assert.equal(record.originAt, 10_000);
  assert.deepEqual(
    record.stages.map((s) => `${s.name}=${s.ms}`),
    ["mainStart=0", "mainLoaded=90", "whenReady=200", "coreForked=210", "core.processStart=230", "core.modulesLoaded=300", "core.dbOpened=350", "core.listening=400", "coreReady=420", "windowCreated=480", "loadStart=490", "entry=700", "firstCommit=900", "firstPaint=950", "interactive=1310"],
  );
  assert.equal(record.timedOut, false);
  assert.equal(record.at, "2026-11-15T10:00:00.000Z");
  assert.equal(bootLogLine(record), "起動の時刻 core=420ms(fork=210ms process=230ms modules=300ms db=350ms listen=400ms) window=480ms 最初の描画=950ms 入力できる=1310ms 取り直した画面の JS=2/23");
});

test("buildBootRecord: 欠けた段階（ログイン時の起動で窓がない・時間切れ）は入れず、1 行では「-」にする", () => {
  const record = buildBootRecord({ at, report: { ...report({ entry: 10_700, interactive: null }), assets: null }, main: { mainStart: 10_000, coreReady: 10_400 }, withMain: true, app, openedAtLogin: true });
  assert.equal(record.timedOut, true);
  assert.equal(record.openedAtLogin, true);
  assert.equal(bootLogLine(record), "起動の時刻 core=400ms(fork=- process=- modules=- db=- listen=-) window=- 最初の描画=- 入力できる=10 秒でそろわず 取り直した画面の JS=-");
});

test("buildBootRecord: 読み込み直し・別ウィンドウは画面の読み込みの始まりを起点にし、メインの段階は入れない", () => {
  const main: MainMarks = { mainStart: 10_000, coreReady: 10_400 };
  const reload = buildBootRecord({ at, report: report({ firstPaint: 10_800, interactive: 11_000 }), main, withMain: false, app, openedAtLogin: false });
  assert.equal(reload.origin, "rendererStart");
  assert.deepEqual(reload.stages, [
    { name: "firstPaint", ms: 300 },
    { name: "interactive", ms: 500 },
  ]);
  assert.equal(bootLogLine(reload), "画面を読み込み直した時刻 最初の描画=300ms 入力できる=500ms 取り直した画面の JS=2/23");
  const popout = buildBootRecord({ at, report: report({ interactive: 10_900 }, "popout"), main, withMain: false, app, openedAtLogin: false });
  assert.match(bootLogLine(popout), /^別ウィンドウの起動の時刻 最初の描画=- 入力できる=400ms/);
});

test("metricsRow: プロセスのメモリを MB、CPU を小数 1 桁にし、画面から届いたメモリとコアの V8 のメモリを添える", () => {
  const row = metricsRow(
    at,
    [
      { type: "Browser", pid: 1, memory: { workingSetSize: 204_800 }, cpu: { percentCPUUsage: 3.14 } },
      { type: "Utility", name: "dbWorker", pid: 2, memory: { workingSetSize: 51_200 }, cpu: { percentCPUUsage: 0 } },
    ],
    [{ window: "main", jsHeapMB: 120, domNodes: 8000, pid: 3 }],
    { heapUsedMB: 80, rssMB: 210 },
  );
  assert.deepEqual(row, {
    at: "2026-11-15T10:00:00.000Z",
    core: { heapUsedMB: 80, rssMB: 210 },
    processes: [
      { type: "Browser", name: null, pid: 1, memoryMB: 200, cpuPercent: 3.1 },
      { type: "Utility", name: "dbWorker", pid: 2, memoryMB: 50, cpuPercent: 0 },
    ],
    renderers: [{ window: "main", jsHeapMB: 120, domNodes: 8000, pid: 3 }],
  });
});
