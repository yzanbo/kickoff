import type { BootMarkName, BootReport, BootWindow, RendererMemory } from "@shared/ipc";

// 画面の起動の時刻（メモの仕様書「0023_表示を軽くする」の案 18c）: 入口 → 表示の設定 → 部品の読み込み → 最初の描き終わり → 最初の描画 → 入力できるまで。
// そろったら IPC の diagnostics.reportBoot で 1 回だけメインへ送る（メインが startup.log・boot.jsonl に書く）。画面のメモリも 60 秒ごとに送る。
// 決め方は純粋な createBootMarks（時計・送り先・描画の待ち方・タイマーは引数）、rAF・performance・IPC につなぐのは下の薄い部分

/** 入力できるまでを待つ長さ。過ぎたら interactive を null にして送る */
export const BOOT_TIMEOUT_MS = 10_000;

/** 入力できるとみなすのに待つ部分（サイドバーの一覧・入力欄） */
export type InteractivePart = "sidebar" | "composer";

interface BootMarksDeps {
  /** いまの時刻（epoch ms） */
  now: () => number;
  send: (report: BootReport) => void;
  /** 描いたあと（rAF 2 回）に呼ぶ */
  afterPaint: (fn: () => void) => void;
  /** ms のあとに呼ぶ */
  later: (ms: number, fn: () => void) => void;
  /** 送る直前に足すもの（描画の時刻・読み込んだファイル） */
  collect: () => Pick<BootReport, "assets"> & { marks: Partial<Record<BootMarkName, number>> };
  timeOrigin: number;
}

/**
 * 印を受けて、そろったら 1 回だけ送る。expect で窓の種類と待つ部分を決め、最初の描き終わり（firstCommit）と待つ部分がそろったら、
 * 描いたあとの時刻を interactive にする。BOOT_TIMEOUT_MS でそろわなければ interactive: null で送る
 */
export function createBootMarks(deps: BootMarksDeps) {
  const marks: Partial<Record<BootMarkName, number | null>> = {};
  let window: BootWindow = "main";
  let waitFor: Set<InteractivePart> | null = null;
  let waiting = false;
  let sent = false;

  const send = () => {
    if (sent) return;
    sent = true;
    const extra = deps.collect();
    deps.send({ window, timeOrigin: deps.timeOrigin, marks: { ...extra.marks, ...marks }, assets: extra.assets });
  };
  const check = () => {
    if (sent || waiting || !waitFor || waitFor.size > 0 || marks.firstCommit === undefined) return;
    waiting = true;
    deps.afterPaint(() => {
      if (sent) return;
      marks.interactive = deps.now();
      send();
    });
  };
  deps.later(BOOT_TIMEOUT_MS, () => {
    if (sent) return;
    marks.interactive = null;
    send();
  });

  return {
    /** 段階に印を付ける（最初の 1 回だけ） */
    mark(name: Exclude<BootMarkName, "interactive" | "firstPaint" | "firstContentfulPaint">) {
      if (sent || marks[name] !== undefined) return;
      marks[name] = deps.now();
      check();
    },
    /** 窓の種類と、入力できるとみなすのに待つ部分を決める（描く前に 1 回） */
    expect(kind: BootWindow, parts: readonly InteractivePart[]) {
      window = kind;
      waitFor ??= new Set(parts);
      check();
    },
    /** 待つ部分が描けた（何度呼んでもよい。待っていない部分は無視する） */
    markInteractive(part: InteractivePart) {
      if (!waitFor?.delete(part)) return;
      check();
    },
  };
}

// ---- 画面につなぐ薄い部分（デスクトップアプリだけ。ブラウザで開いた画面は window.kickoff がないので送らない） ----

const epochNow = () => performance.timeOrigin + performance.now();

/** 描画の時刻（first-paint・first-contentful-paint）と、/assets/ の下の読み込み（キャッシュから出なかった = 300B を超えて取ったもの） */
function collectPerformance(): ReturnType<BootMarksDeps["collect"]> {
  const marks: Partial<Record<BootMarkName, number>> = {};
  for (const entry of performance.getEntriesByType("paint")) {
    if (entry.name === "first-paint") marks.firstPaint = performance.timeOrigin + entry.startTime;
    if (entry.name === "first-contentful-paint") marks.firstContentfulPaint = performance.timeOrigin + entry.startTime;
  }
  const assets = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((r) => new URL(r.name, location.href).pathname.startsWith("/assets/"));
  return {
    marks,
    assets: {
      count: assets.length,
      refetched: assets.filter((r) => r.transferSize > 300).length,
      encodedKB: Math.round(assets.reduce((sum, r) => sum + r.encodedBodySize, 0) / 1024),
    },
  };
}

const native = typeof window === "undefined" ? undefined : window.kickoff;

const boot = native
  ? createBootMarks({
      now: epochNow,
      send: (report) => native.diagnostics.reportBoot(report),
      afterPaint: (fn) => requestAnimationFrame(() => requestAnimationFrame(fn)),
      later: (ms, fn) => void setTimeout(fn, ms),
      collect: collectPerformance,
      timeOrigin: performance.timeOrigin,
    })
  : null;

/** 起動の段階に印を付ける */
export const bootMark = (name: Parameters<NonNullable<typeof boot>["mark"]>[0]) => boot?.mark(name);
/** 窓の種類と、入力できるとみなすのに待つ部分を決める（描く前に 1 回） */
export const expectInteractive = (kind: BootWindow, parts: readonly InteractivePart[]) => boot?.expect(kind, parts);
/** 待つ部分が描けた（サイドバーの一覧・入力欄） */
export const markInteractive = (part: InteractivePart) => boot?.markInteractive(part);

/** 画面のメモリを送る間隔 */
const MEMORY_REPORT_MS = 60_000;

/** 画面のメモリ（JavaScript のメモリ・要素の数）を 60 秒ごとに、手の空いたときに送る（隠れている間も。増え方を見るため） */
export function startMemoryReports(kind: BootWindow) {
  if (!native) return;
  setInterval(() => {
    requestIdleCallback(
      () => {
        const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
        const memory: RendererMemory = { window: kind, jsHeapMB: heap === undefined ? null : Math.round(heap / 1048576), domNodes: document.getElementsByTagName("*").length };
        native.diagnostics.reportMemory(memory);
      },
      { timeout: 5_000 },
    );
  }, MEMORY_REPORT_MS);
}
