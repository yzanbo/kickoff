// 性能の記録（diagnostics.ts）で、画面の中の「操作の遅れ」と「長いフレーム」を集める。
// 画面で評価する式（RENDERER_OBSERVE / RENDERER_COLLECT）と、集めたものをまとめる純粋関数（テストする）

/** 1 回の操作（キー入力・クリックなど）にかかった時間（Event Timing。16ms 以上のものだけが届く） */
export interface InteractionEntry {
  name: string;
  /** 押してから画面に出るまで（ms。8ms 刻み） */
  duration: number;
  /** 押してから処理が始まるまで（ほかの処理が詰まっていた時間） */
  inputDelay: number;
  /** 処理そのもの（イベントの受け取りの中の JavaScript） */
  processing: number;
  /** 処理のあと、描いて画面に出るまで（スタイル・レイアウト・描画） */
  presentation: number;
  /** 押した要素（タグとクラスの先頭 3 つ） */
  target: string;
}

/** 長いフレーム（Long Animation Frame。50ms 以上かかったフレーム）と、その中で時間を使ったスクリプト */
export interface FrameEntry {
  duration: number;
  /** 操作をふさいだ時間 */
  blocking: number;
  /** スタイルの計算とレイアウト */
  styleLayout: number;
  scripts: { invoker: string; source: string; fn: string; duration: number; forcedLayout: number }[];
}

/** 画面で集めたもの（RENDERER_COLLECT の返り値） */
export interface RendererTimings {
  events: InteractionEntry[];
  frames: FrameEntry[];
  longTasks: number;
  longTaskMs: number;
  /** 文書に付いているノードの数（テキストも含む。Performance.getMetrics の Nodes と比べると、外れたままのノードの目安になる） */
  attachedNodes: number;
}

/** 集める件数の上限（10 秒の間に操作し続けても、記録が大きくなりすぎないように） */
const MAX_ENTRIES = 500;

/** 記録を始めるときに画面で評価する式: 操作の遅れ・長いフレーム・長いタスクを、window に貯め始める */
export const RENDERER_OBSERVE = `(() => {
  const d = (window.__kickoffDiagnostics = { events: [], frames: [], longTasks: 0, longTaskMs: 0, observers: [] });
  const observe = (type, opts, fn) => {
    try {
      const o = new PerformanceObserver((list) => list.getEntries().forEach(fn));
      o.observe({ type, ...opts });
      d.observers.push(o);
    } catch {}
  };
  const describe = (el) => {
    if (!el || !el.tagName) return "";
    const cls = typeof el.className === "string" ? el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 3) : [];
    return el.tagName.toLowerCase() + cls.map((c) => "." + c).join("");
  };
  const file = (url) => (url || "").split("/").pop().split("?")[0];
  observe("event", { durationThreshold: 16 }, (e) => {
    if (d.events.length >= ${MAX_ENTRIES}) return;
    d.events.push({
      name: e.name,
      duration: Math.round(e.duration),
      inputDelay: Math.round(e.processingStart - e.startTime),
      processing: Math.round(e.processingEnd - e.processingStart),
      presentation: Math.max(0, Math.round(e.startTime + e.duration - e.processingEnd)),
      target: describe(e.target),
    });
  });
  observe("long-animation-frame", {}, (f) => {
    if (d.frames.length >= ${MAX_ENTRIES}) return;
    d.frames.push({
      duration: Math.round(f.duration),
      blocking: Math.round(f.blockingDuration || 0),
      styleLayout: f.styleAndLayoutStart ? Math.round(f.startTime + f.duration - f.styleAndLayoutStart) : 0,
      scripts: (f.scripts || []).map((s) => ({
        invoker: s.invoker || "",
        source: file(s.sourceURL) + (s.sourceCharPosition >= 0 ? ":" + s.sourceCharPosition : ""),
        fn: s.sourceFunctionName || "",
        duration: Math.round(s.duration),
        forcedLayout: Math.round(s.forcedStyleAndLayoutDuration || 0),
      })),
    });
  });
  observe("longtask", {}, (t) => {
    d.longTasks++;
    d.longTaskMs += t.duration;
  });
  return "{}";
})()`;

/** 記録の終わりに画面で評価する式: 貯めたものを返して、見張りをやめる（返り値は JSON の文字列） */
export const RENDERER_COLLECT = `(() => {
  const d = window.__kickoffDiagnostics || { events: [], frames: [], longTasks: 0, longTaskMs: 0, observers: [] };
  d.observers.forEach((o) => o.disconnect());
  delete window.__kickoffDiagnostics;
  let attachedNodes = 0;
  const walker = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
  while (walker.nextNode()) attachedNodes++;
  return JSON.stringify({ events: d.events, frames: d.frames, longTasks: d.longTasks, longTaskMs: Math.round(d.longTaskMs), attachedNodes });
})()`;

const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : 0);

/** 操作の遅れを、種類（keydown・input・click など）ごとの数と遅さ、遅かったものの上位にまとめる */
export function summarizeInteractions(events: InteractionEntry[], limit = 15) {
  const byName = new Map<string, number[]>();
  for (const e of events) byName.set(e.name, [...(byName.get(e.name) ?? []), e.duration]);
  const kinds = [...byName.entries()]
    .map(([name, durations]) => {
      const sorted = [...durations].sort((a, b) => a - b);
      return { name, count: sorted.length, p50: percentile(sorted, 0.5), p90: percentile(sorted, 0.9), max: sorted[sorted.length - 1] ?? 0 };
    })
    .sort((a, b) => b.count - a.count);
  const slowest = [...events].sort((a, b) => b.duration - a.duration).slice(0, limit);
  return { count: events.length, kinds, slowest };
}

/** 長いフレームを、合計・遅かったものの上位と、時間を使ったスクリプト（場所と関数ごとに合計）にまとめる */
export function summarizeFrames(frames: FrameEntry[], limit = 10) {
  const scripts = new Map<string, { invoker: string; source: string; fn: string; count: number; totalMs: number; forcedLayoutMs: number }>();
  for (const f of frames) {
    for (const s of f.scripts) {
      const key = `${s.source}|${s.fn}|${s.invoker}`;
      const entry = scripts.get(key) ?? { invoker: s.invoker, source: s.source, fn: s.fn, count: 0, totalMs: 0, forcedLayoutMs: 0 };
      entry.count++;
      entry.totalMs += s.duration;
      entry.forcedLayoutMs += s.forcedLayout;
      scripts.set(key, entry);
    }
  }
  return {
    count: frames.length,
    totalMs: frames.reduce((n, f) => n + f.duration, 0),
    blockingMs: frames.reduce((n, f) => n + f.blocking, 0),
    styleLayoutMs: frames.reduce((n, f) => n + f.styleLayout, 0),
    slowest: [...frames].sort((a, b) => b.duration - a.duration).slice(0, limit),
    topScripts: [...scripts.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, 20),
  };
}
