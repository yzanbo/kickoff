// 測った値のまとめ方（純粋な関数。scripts/perf/ の各スクリプトが使い、stats.test.mjs で確かめる）

/** 並べた値の分位（p は 0〜1。最近接順位法） */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank];
}

/** 中央値・95%・最大・件数 */
export function summarize(values) {
  return { n: values.length, median: percentile(values, 0.5), p95: percentile(values, 0.95), max: values.length ? Math.max(...values) : null };
}

/** プロファイルの 1 つの呼び出し場所が、どの分類か（React・Markdown・アプリのコード・GC など） */
export function categoryOf(callFrame) {
  const { functionName, url } = callFrame;
  if (functionName === "(garbage collector)") return "gc";
  if (functionName === "(idle)") return "idle";
  if (functionName === "(program)") return "program";
  if (/react-dom|react\.development|scheduler/.test(url)) return "react";
  if (/react-markdown|remark|micromark|mdast|hast|unified|rehype|vfile|unist|property-information|decode-named/.test(url)) return "markdown";
  if (/shiki|mermaid|katex/.test(url)) return "heavy";
  if (/\/src\//.test(url) && !/node_modules/.test(url)) return "app";
  if (url) return "lib";
  return "other";
}

/** 呼び出し場所を短い 1 行の名前にする（関数名とファイル:行） */
export function frameLabel(callFrame) {
  const file = callFrame.url.replace(/^.*\/(src|node_modules|deps)\//, "$1/").replace(/\?.*$/, "");
  return `${callFrame.functionName || "(anon)"} ${file}:${callFrame.lineNumber + 1}`;
}

/**
 * CDP の Profiler のプロファイルを、分類ごと・関数ごとの自分の時間（ms）にまとめる。
 * top は自分の時間の多い順に件数を絞る
 */
export function summarizeProfile(profile, top = 20) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const categories = {};
  const self = new Map();
  let totalUs = 0;
  profile.samples.forEach((sample, i) => {
    const node = byId.get(sample);
    const us = profile.timeDeltas[i] ?? 0;
    totalUs += us;
    const cat = categoryOf(node.callFrame);
    categories[cat] = (categories[cat] ?? 0) + us;
    const label = frameLabel(node.callFrame);
    self.set(label, (self.get(label) ?? 0) + us);
  });
  const ms = (us) => Math.round(us / 100) / 10;
  return {
    totalMs: ms(totalUs),
    categories: Object.fromEntries(Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, ms(v)])),
    top: [...self].sort((a, b) => b[1] - a[1]).slice(0, top).map(([label, us]) => ({ label, ms: ms(us) })),
  };
}
