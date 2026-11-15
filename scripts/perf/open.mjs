// チャットを開く時間を測る: 画面を読み込み直してから初めて開く（表示まで）と、ほかのチャットへ切り替えて戻る。
// node scripts/perf/open.mjs [--chat 224] [--other <ID>] [--json]
import { parseArgs } from "node:util";
import { api, connectPage, metrics, metricsDelta, sleep } from "./cdp.mjs";
import { summarizeProfile } from "./stats.mjs";

/** 記録の ID のどれかが、見えている流れに描かれるまで待つ式（ms。見えなければ null） */
const waitVisibleExpr = (ids, timeoutMs = 30000) => `(async () => {
  const ids = ${JSON.stringify(ids)};
  const t0 = performance.now();
  while (performance.now() - t0 < ${timeoutMs}) {
    await new Promise((r) => requestAnimationFrame(r));
    for (const id of ids) for (const el of document.querySelectorAll('[id="ev-' + id + '"]')) if (el.offsetParent) return performance.now() - t0;
  }
  return null;
})()`;

/** 画面を読み込み直し、サイドバーが描かれるまで待つ */
async function reload(page) {
  await page.send("Page.enable");
  await page.send("Page.reload", { ignoreCache: false });
  await sleep(500);
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(`!!document.querySelector(".sidebar")`).catch(() => false)) return;
    await sleep(200);
  }
  throw new Error("読み込み直したあとサイドバーが出ません");
}

/** 移り始めてから見えるまでの時間と、そのあと 1.5 秒の長いタスク・getMetrics の差・プロファイル */
async function measureNavigation(page, hash, ids) {
  await page.send("Performance.enable");
  await page.send("Profiler.enable");
  await page.send("Profiler.setSamplingInterval", { interval: 200 });
  await page.evaluate(`(window.__perfLong = [], window.__perfPo?.disconnect(), window.__perfPo = new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__perfLong.push(Math.round(e.duration)))), window.__perfPo.observe({ type: "longtask" }), 1)`);
  const before = await metrics(page);
  await page.send("Profiler.start");
  const shownMs = await page.evaluate(`(location.hash = ${JSON.stringify(hash)}, ${waitVisibleExpr(ids)})`);
  await sleep(1500);
  const { profile } = await page.send("Profiler.stop");
  const after = await metrics(page);
  const longTasks = await page.evaluate(`(window.__perfPo.disconnect(), window.__perfLong)`);
  const mem = await page.evaluate(`({ nodes: document.getElementsByTagName("*").length, heapMB: Math.round(performance.memory.usedJSHeapSize / 1e6) })`);
  return { shownMs: shownMs === null ? null : Math.round(shownMs), longTasks, longTotal: longTasks.reduce((a, b) => a + b, 0), metrics: metricsDelta(before, after), ...mem, profile: summarizeProfile(profile, 15) };
}

/** 初めて開く（読み込み直したあと）と、切り替えて戻る */
export async function measureOpen({ chatId = 224, otherId } = {}) {
  const detail = await api("GET", `/api/chats/${chatId}?limit=30`);
  const projectId = detail.chat.project_id;
  const ids = detail.events.map((e) => e.id);
  // 戻る前に開くほかのチャット（同じプロジェクトの、短いもの）
  let other = otherId;
  if (!other) {
    const chats = await api("GET", `/api/projects/${projectId}/chats`);
    other = (Array.isArray(chats) ? chats : chats.chats).find((c) => c.id !== chatId && !c.archived_at && c.parent_chat_id === null)?.id;
  }
  const page = await connectPage();
  try {
    await reload(page);
    await page.evaluate(`(location.hash = "#/projects/${projectId}", 1)`);
    await sleep(1000);
    const first = await measureNavigation(page, `#/projects/${projectId}/chats/${chatId}`, ids);
    let back = null;
    if (other) {
      const otherIds = (await api("GET", `/api/chats/${other}?limit=30`)).events.map((e) => e.id);
      await measureNavigation(page, `#/projects/${projectId}/chats/${other}`, otherIds);
      await sleep(500);
      back = await measureNavigation(page, `#/projects/${projectId}/chats/${chatId}`, ids);
    }
    return { chatId, otherId: other ?? null, first, back };
  } finally {
    page.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { chat: { type: "string", default: "224" }, other: { type: "string" }, json: { type: "boolean" } } });
  const r = await measureOpen({ chatId: Number(values.chat), otherId: values.other ? Number(values.other) : undefined });
  if (values.json) console.log(JSON.stringify(r, null, 1));
  else
    for (const [name, m] of [["初めて開く", r.first], ["切り替えて戻る", r.back]]) {
      if (!m) continue;
      console.log(`${name}: 表示まで ${m.shownMs}ms・長いタスク ${m.longTotal}ms ${JSON.stringify(m.longTasks)}・DOM ${m.nodes}・ヒープ ${m.heapMB}MB`);
      console.log("  getMetrics:", m.metrics, "分類:", m.profile.categories);
      m.profile.top.slice(0, 8).forEach((t) => console.log("  ", String(t.ms).padStart(7), t.label));
    }
}
