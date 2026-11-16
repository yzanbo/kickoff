import { app, type WebContents } from "electron";
import type { BootReport, RendererMemory } from "@shared/ipc";
import { rotatingLog } from "../app/logFiles.js";
import { openedAtLogin } from "../app/loginItem.js";
import { startupLog } from "../app/startupLog.js";
import { bootLogLine, buildBootRecord, metricsRow, type BootRecord, type MainMarks, type MainStage, type MetricsRow } from "./bootTimeline.js";

// 起動の時刻と画面のメモリ（定期）の記録（メモの仕様書「0023_表示を軽くする」の案 18c）。組み立ては bootTimeline.ts。
// ~/Library/Logs/<アプリ名>/boot.jsonl（1 回の読み込みで 1 行）と metrics.jsonl（60 秒ごとに 1 行）に書き、起動の時刻は startup.log にも 1 行書く

/** これを超えたら 1 世代だけ残す（boot は約 300 回分、metrics は 1 行 400 字ほどで約 21 時間分） */
const BOOT_LOG_MAX_BYTES = 128 * 1024;
const METRICS_LOG_MAX_BYTES = 512 * 1024;
/** プロセスのメモリを記録する間隔 */
const METRICS_INTERVAL_MS = 60_000;
/** メモリに持つ最近の行（60 分。診断の summary.json に入れる） */
const RECENT_METRICS = 60;

const bootLog = rotatingLog("boot.jsonl", BOOT_LOG_MAX_BYTES);
const metricsLog = rotatingLog("metrics.jsonl", METRICS_LOG_MAX_BYTES);

/** メインの段階の時刻（epoch ms）。mainStart はプロセスが始まった時刻 */
const mainMarks: MainMarks = { mainStart: performance.timeOrigin };
let mainWindowReported = false;
let lastBoot: BootRecord | null = null;
const recentMetrics: MetricsRow[] = [];
/** 前の行から届いた画面のメモリ（画面ごとに最後のもの） */
const rendererMemory = new Map<number, RendererMemory & { pid: number }>();

/** メインの段階に印を付ける（最初の 1 回だけ。画面の読み込み直しでは付け直さない） */
export function markMain(stage: MainStage) {
  mainMarks[stage] ??= performance.timeOrigin + performance.now();
}

/** 画面から届いた起動の時刻を書く（メインのウィンドウの最初の 1 回だけメインの段階も入れる） */
export function recordBoot(report: BootReport) {
  const withMain = report.window === "main" && !mainWindowReported;
  if (report.window === "main") mainWindowReported = true;
  const record = buildBootRecord({
    at: new Date(),
    report,
    main: mainMarks,
    withMain,
    app: { name: app.getName(), version: app.getVersion(), electron: process.versions.electron, packaged: app.isPackaged },
    openedAtLogin: openedAtLogin(),
  });
  bootLog.appendJson(record);
  if (record.window === "main") {
    lastBoot = record;
    startupLog(bootLogLine(record));
  }
}

/** 画面から届いたメモリを、次の行まで覚える */
export function recordRendererMemory(sender: WebContents, memory: RendererMemory) {
  rendererMemory.set(sender.id, { ...memory, pid: sender.getOSProcessId() });
}

/** 60 秒ごとに、プロセスごとのメモリ・CPU と画面から届いたメモリを metrics.jsonl に書く（コアを起動したあとに 1 回） */
export function startMetricsLog() {
  // CPU は「前に測ってからの使用率」なので、始めに一度測っておく
  app.getAppMetrics();
  const timer = setInterval(() => {
    const row = metricsRow(new Date(), app.getAppMetrics(), [...rendererMemory.values()]);
    rendererMemory.clear();
    metricsLog.appendJson(row);
    recentMetrics.push(row);
    if (recentMetrics.length > RECENT_METRICS) recentMetrics.shift();
  }, METRICS_INTERVAL_MS);
  timer.unref();
}

/** 診断の summary.json に入れる: 最後の起動の時刻と最近 60 分のメモリ */
export function bootSummary() {
  return { lastBoot, metrics: [...recentMetrics] };
}
