import { BOOT_MARKS, type BootReport, type BootWindow, type RendererMemory } from "@shared/ipc";

// 起動の時刻と画面のメモリの記録の組み立て（メモの仕様書「0023_表示を軽くする」の案 18c）。Electron に依らない（つなぐのは bootRecorder.ts）。
// 時刻はすべて epoch ms（performance.timeOrigin + performance.now()）でそろえ、プロセスをまたいで引き算する

/**
 * メインプロセスの段階（起きる順）。core.* はコアのプロセスの段階（CoreReady.timings。プロセスの始まり・モジュールを読み終えた・DB を開いた・
 * 待ち受けを始めた）で、coreForked はメインがコアのプロセスを起動した時刻（メモの仕様書「0023_表示を軽くする」の案 16）
 */
const MAIN_STAGES = [
  "mainStart",
  "mainLoaded",
  "whenReady",
  "coreForked",
  "core.processStart",
  "core.modulesLoaded",
  "core.dbOpened",
  "core.listening",
  "coreReady",
  "windowCreated",
  "loadStart",
  "domReady",
  "loaded",
] as const;
export type MainStage = (typeof MAIN_STAGES)[number];
export type MainMarks = Partial<Record<MainStage, number>>;

/** boot.jsonl の 1 行 */
export interface BootRecord {
  at: string;
  window: BootWindow;
  /** 起点: メインのウィンドウの最初の読み込みはメインプロセスの始まり、読み込み直し・別ウィンドウは画面の読み込みの始まり */
  origin: "mainStart" | "rendererStart";
  originAt: number;
  /** 起点からの経過（ms）を早い順に（取れなかった段階は入れない） */
  stages: { name: string; ms: number }[];
  /** 入力できるまでが 10 秒でそろわなかった */
  timedOut: boolean;
  assets: BootReport["assets"];
  app: { name: string; version: string; electron: string; packaged: boolean };
  openedAtLogin: boolean;
}

/**
 * 画面から届いた時刻とメインの段階を 1 行にする。withMain: メインのウィンドウの最初の読み込み（メインの段階も入れ、メインの始まりを起点にする）
 */
export function buildBootRecord(opts: { at: Date; report: BootReport; main: MainMarks; withMain: boolean; app: BootRecord["app"]; openedAtLogin: boolean }): BootRecord {
  const { report, main, withMain } = opts;
  const fromMain = withMain && main.mainStart !== undefined;
  const originAt = fromMain ? main.mainStart! : report.timeOrigin;
  const times: [string, number][] = [];
  if (fromMain) for (const name of MAIN_STAGES) if (main[name] !== undefined) times.push([name, main[name]]);
  for (const name of BOOT_MARKS) {
    const t = report.marks[name];
    if (typeof t === "number") times.push([name, t]);
  }
  const stages = times.map(([name, t]) => ({ name, ms: Math.round(t - originAt) })).sort((a, b) => a.ms - b.ms);
  return {
    at: opts.at.toISOString(),
    window: report.window,
    origin: fromMain ? "mainStart" : "rendererStart",
    originAt,
    stages,
    timedOut: report.marks.interactive === null,
    assets: report.assets,
    app: opts.app,
    openedAtLogin: opts.openedAtLogin,
  };
}

/** startup.log の 1 行（起点からの経過。取れなかった段階は「-」） */
export function bootLogLine(record: BootRecord): string {
  const ms = (name: string) => {
    const stage = record.stages.find((s) => s.name === name);
    return stage ? `${stage.ms}ms` : "-";
  };
  const head = record.origin === "mainStart" ? "起動の時刻" : record.window === "main" ? "画面を読み込み直した時刻" : "別ウィンドウの起動の時刻";
  const core = `(fork=${ms("coreForked")} process=${ms("core.processStart")} modules=${ms("core.modulesLoaded")} db=${ms("core.dbOpened")} listen=${ms("core.listening")})`;
  const main = record.origin === "mainStart" ? ` core=${ms("coreReady")}${core} window=${ms("windowCreated")}` : "";
  const assets = record.assets ? `${record.assets.refetched}/${record.assets.count}` : "-";
  return `${head}${main} 最初の描画=${ms("firstPaint")} 入力できる=${record.timedOut ? "10 秒でそろわず" : ms("interactive")} 取り直した画面の JS=${assets}`;
}

/** app.getAppMetrics() の 1 件のうち使う所 */
export interface AppProcessMetric {
  type: string;
  name?: string;
  pid: number;
  memory: { workingSetSize: number };
  cpu: { percentCPUUsage: number };
}

/** metrics.jsonl の 1 行 */
export interface MetricsRow {
  at: string;
  /** コアのプロセスの V8 のメモリ（MB。聞けなければ null） */
  core: { heapUsedMB: number; rssMB: number } | null;
  /** プロセスごと（Browser = メイン・Tab = 画面・GPU・Utility = コア（Kickoff Core）と DB ワーカー（名前で分ける））のメモリ（MB）と CPU（%） */
  processes: { type: string; name: string | null; pid: number; memoryMB: number; cpuPercent: number }[];
  /** この間に画面から届いたメモリ（窓ごとに最後のもの） */
  renderers: (RendererMemory & { pid: number })[];
}

export function metricsRow(at: Date, processes: readonly AppProcessMetric[], renderers: readonly (RendererMemory & { pid: number })[], core: MetricsRow["core"] = null): MetricsRow {
  return {
    at: at.toISOString(),
    core,
    processes: processes.map((p) => ({
      type: p.type,
      name: p.name || null,
      pid: p.pid,
      // workingSetSize は KB
      memoryMB: Math.round(p.memory.workingSetSize / 1024),
      cpuPercent: Math.round(p.cpu.percentCPUUsage * 10) / 10,
    })),
    renderers: [...renderers],
  };
}
