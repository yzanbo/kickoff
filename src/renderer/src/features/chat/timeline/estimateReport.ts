import { estimateItem, estimateKind, type EstimateContext } from "./rowEstimate";
import type { TimelineItem } from "./timelineItems";
import { timelineView } from "./timelineView";

/**
 * 開発版だけ: 見積もりを合わせるための報告（window.__timelineEstimateReport(チャットの ID)）。測った高さのある項目について、
 * 種類ごとに「見積もり（補正の前）÷ 測った高さ」の中央値を出す（メモの仕様書「0023_表示を軽くする」の分冊 2 の 1-5。合格は 0.8〜1.25）。
 * 製品版のビルドでは import.meta.env.DEV が false になり、呼ぶ所ごと消える
 */
const latest = new Map<number, { items: readonly TimelineItem[]; width: number; scale: number }>();

export function noteEstimateItems(chatId: number, items: readonly TimelineItem[], width: number, scale: number) {
  latest.set(chatId, { items, width, scale });
  (window as unknown as { __timelineEstimateReport?: (id: number) => unknown }).__timelineEstimateReport ??= report;
}

function report(chatId: number) {
  const seen = latest.get(chatId);
  if (!seen) return null;
  const view = timelineView(chatId);
  const open = view.open.get();
  const ctx: EstimateContext = { textWidth: seen.width || 720, scale: seen.scale, isOpen: (k) => open.has(k), correction: () => 1 };
  const byKind: Record<string, number[]> = {};
  for (const item of seen.items) {
    const measured = view.sizes.peek(item.key);
    if (!measured) continue;
    (byKind[estimateKind(item)] ??= []).push(estimateItem(item, ctx) / measured);
  }
  const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const all = Object.values(byKind).flat();
  return {
    measured: all.length,
    median: all.length ? median(all) : null,
    kinds: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, { n: v.length, median: median(v) }])),
    correction: Object.fromEntries(view.correction),
  };
}
