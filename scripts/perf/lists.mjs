// 長くなる一覧（サイドバー・ボード・全プロジェクトの画面）を描く時間を、JS（React）とレイアウト・スタイルに分けて測る。
// チャットは DB に足さない: 画面の fetch を差し替えて、GET /api/chats に偽のチャットを足して返す（API で作ると AI に送るため）。
// 測り終えたら差し替えを外し、localStorage を元に戻して読み込み直す。
// node scripts/perf/lists.mjs [--count 1000] [--project 21] [--groups 8] [--runs 3] [--json] [--fixture]（--fixture は決まったデータの開発版の ID・ポート）
import { parseArgs } from "node:util";
import { STORAGE_IMPORTS, api, connectPage, metrics, metricsDelta, reload, sleep, withSavedStorage } from "../devtools/cdp.mjs";
import { perfDefaults } from "../devtools/fixture.mjs";
import { shimSource } from "../devtools/listShim.mjs";
import { summarize, summarizeProfile } from "./stats.mjs";

/**
 * action のあと rAF ごとに数（count の式）を見て、first 以上になった（最初に見えた）時刻と all 以上になった（すべて描いた）時刻（ms）。
 * あわせて、その間の長いタスク（50ms 以上）の長さ
 */
const untilExpr = (action, count, first, all, timeoutMs = 30000) => `(async () => {
  const long = [];
  const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => long.push(Math.round(e.duration))));
  po.observe({ type: "longtask" });
  const t0 = performance.now();
  await (async () => { ${action} })();
  let firstMs = null;
  while (performance.now() - t0 < ${timeoutMs}) {
    await new Promise((r) => requestAnimationFrame(r));
    const n = ${count};
    if (firstMs === null && n >= ${first}) firstMs = Math.round(performance.now() - t0);
    if (n >= ${all}) {
      const allMs = Math.round(performance.now() - t0);
      await new Promise((r) => requestAnimationFrame(r));
      po.disconnect();
      return { firstMs, paintMs: allMs, longest: Math.max(0, ...long), longTotal: long.reduce((a, b) => a + b, 0) };
    }
  }
  po.disconnect();
  return { firstMs, paintMs: null };
})()`;

/**
 * トレースの画面のメインスレッドの出来事を、自分の時間（子の出来事を引いた時間）で種類ごとに足す（ms）。
 * JS の中から強いたレイアウト（offsetHeight を読むなど）も、JS ではなくレイアウトに数える
 */
export function traceBreakdown(events) {
  const main = events.find((e) => e.ph === "M" && e.name === "thread_name" && e.args?.name === "CrRendererMain");
  if (!main) return {};
  const KIND = {
    FunctionCall: "js", EvaluateScript: "js", "v8.evaluateModule": "js", RunMicrotasks: "js", TimerFire: "js", FireAnimationFrame: "js", EventDispatch: "js", "v8.callFunction": "js", V8Execute: "js",
    Layout: "layout", UpdateLayoutTree: "style", RecalculateStyles: "style", ParseHTML: "parse", ParseAuthorStyleSheet: "style",
    Paint: "paint", PrePaint: "paint", Layerize: "paint", "Commit": "paint", UpdateLayer: "paint", "ScrollableAreaUpdate": "paint", IntersectionObserverController_computeIntersections: "observer", "ResizeObserverController::BroadcastObservations": "observer",
    MinorGC: "gc", MajorGC: "gc", "V8.GC_SCAVENGER": "gc", "BlinkGC.AtomicPhase": "gc",
  };
  const list = events.filter((e) => e.pid === main.pid && e.tid === main.tid && e.ph === "X" && typeof e.dur === "number").sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const out = {};
  const stack = [];
  const add = (node) => {
    const kind = KIND[node.e.name] ?? (node.parentKind ?? "other");
    out[kind] = (out[kind] ?? 0) + Math.max(0, node.e.dur - node.child);
  };
  for (const e of list) {
    while (stack.length && stack.at(-1).e.ts + stack.at(-1).e.dur <= e.ts) add(stack.pop());
    const parent = stack.at(-1);
    if (parent) parent.child += e.dur;
    stack.push({ e, child: 0, parentKind: parent ? (KIND[parent.e.name] ?? parent.parentKind) : undefined });
  }
  while (stack.length) add(stack.pop());
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(v / 100) / 10]).sort((a, b) => b[1] - a[1]));
}

/** トレースを取りながら 1 回の操作（見えるまでの時間と、種類ごとの自分の時間） */
async function measureTrace(page, { action, count, first, all }) {
  const events = [];
  const off = page.on((m) => {
    if (m.method === "Tracing.dataCollected") events.push(...m.params.value);
  });
  const done = new Promise((resolve) => {
    const stop = page.on((m) => {
      if (m.method === "Tracing.tracingComplete") (stop(), resolve());
    });
  });
  await page.send("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8", "blink.user_timing"] } });
  const shown = await page.evaluate(untilExpr(action, count, first, all));
  await sleep(800);
  await page.send("Tracing.end");
  await done;
  off();
  return { ...shown, trace: traceBreakdown(events) };
}

/** 1 回の操作を測る: 見えるまでの時間・getMetrics の差（JS・レイアウト・スタイル）・プロファイルの分類 */
async function measure(page, { action, count, first, all }) {
  await page.send("Profiler.setSamplingInterval", { interval: 500 });
  const before = await metrics(page);
  await page.send("Profiler.start");
  const shown = await page.evaluate(untilExpr(action, count, first, all));
  await sleep(800);
  const { profile } = await page.send("Profiler.stop");
  const after = await metrics(page);
  const p = summarizeProfile(profile, 10);
  const nodes = await page.evaluate(`document.getElementsByTagName("*").length`);
  const shape = await page.evaluate(`(() => {
    const median = (sel) => { const hs = [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect().height).filter((h) => h > 0).sort((a, b) => a - b); return hs.length ? Math.round(hs[hs.length >> 1]) : null; };
    return { rows: document.querySelectorAll(".workspaces a.chat-row[data-chat-id]").length, cards: ${CARDS}, board: document.querySelector(".board-main")?.className ?? null, rowH: median(".workspaces a.chat-row"), rowHist: (() => { const c = {}; document.querySelectorAll(".workspaces a.chat-row").forEach((e) => { const h = Math.round(e.getBoundingClientRect().height); c[h] = (c[h] ?? 0) + 1; }); return c; })(), cardH: median(".board-main .board-card"), listH: median(".board-main .list-row") };
  })()`);
  return { ...shown, ...metricsDelta(before, after), react: p.categories.react ?? 0, app: p.categories.app ?? 0, lib: p.categories.lib ?? 0, gc: p.categories.gc ?? 0, nodes, ...shape, top: p.top.slice(0, 6) };
}

const ROWS = (projectId) => `document.querySelectorAll('.workspace-page[data-project-id="${projectId}"] a.chat-row[data-chat-id]').length`;
const CARDS = `document.querySelectorAll(".board-main [data-chat-id]").length`;
const imports = STORAGE_IMPORTS;

/** 測る場面（setup で前の状態にしてから、action で開く） */
function scenarios(projectId, count) {
  const sidebarOpen = (grouping) => ({
    name: `サイドバー: プロジェクトの一覧を開く（${grouping}）`,
    setup: `${imports} s.writeSetting(k.chatList.sections, "${grouping}"); f.foldAll("sidebar", true); location.hash = "#/projects/${projectId}/notes";`,
    action: `${imports} f.foldAll("sidebar", false);`,
    count: ROWS(projectId),
  });
  const sidebarSwitch = (from, to) => ({
    name: `サイドバー: まとめ方を切り替える（${from} → ${to}）`,
    setup: `${imports} f.foldAll("sidebar", false); s.writeSetting(k.chatList.sections, "${from}"); location.hash = "#/projects/${projectId}/notes";`,
    action: `${imports} s.writeSetting(k.chatList.sections, "${to}");`,
    count: ROWS(projectId),
  });
  const board = (name, view, columns, hash) => ({
    name,
    // 先にボードを閉じる（開いたボードは見え方を覚え直すので、開いたまま書くと戻される）
    setup: `${imports} location.hash = "#/projects/${projectId}/notes"; await new Promise((r) => setTimeout(r, 500)); f.foldAll("sidebar", true); const v = s.readSetting(k.board.${hash === "#/" ? "layoutAll" : "layoutProject"}); s.writeSetting(k.board.${hash === "#/" ? "layoutAll" : "layoutProject"}, { sort: { key: "active", dir: "desc" }, ...(v ?? {}), view: "${view}", columns: "${columns}", lanes: "${hash === "#/" ? "project" : "none"}", archive: "active" }); location.hash = "#/projects/${projectId}/notes";`,
    action: `location.hash = "${hash}";`,
    count: CARDS,
  });
  // 最初に見えた = 10 行・カード、すべて描いた = 足した偽のチャットの数
  const done = (sc) => ({ ...sc, first: Math.min(count, 10), all: count });
  return [
    sidebarOpen("none"),
    sidebarOpen("group"),
    sidebarOpen("worktree"),
    sidebarSwitch("none", "group"),
    board("ボード: カンバン（状態の列）", "board", "state", `#/projects/${projectId}/board`),
    board("ボード: カンバン（グループの列）", "board", "groups", `#/projects/${projectId}/board`),
    board("ボード: リスト（状態）", "list", "state", `#/projects/${projectId}/board`),
    board("全プロジェクト: カンバン（状態の列）", "board", "state", "#/"),
    board("全プロジェクト: リスト（状態）", "list", "state", "#/"),
  ].map(done);
}

export async function measureLists({ count = 1000, projectId = 21, groups = 8, runs = 3, only, trace = false } = {}) {
  const template = (await api("GET", `/api/projects/${projectId}/chats`))[0];
  if (!template) throw new Error(`プロジェクト ${projectId} にチャットがありません（偽のチャットの型に使う）`);
  const page = await connectPage();
  const results = [];
  try {
    // 測り終えたら localStorage とハッシュを元に戻して読み込み直す
    await withSavedStorage(page, async () => {
      let scriptId = null;
      try {
        await page.send("Page.enable");
        await page.send("Performance.enable");
        await page.send("Profiler.enable");
        if (count > 0) ({ identifier: scriptId } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: shimSource({ template, projectId, count, groups }) }));
        // 要対応だけ・アーカイブ済みを隠す（測るチャットがすべて並ぶように）
        await page.evaluate(`(localStorage.setItem("kickoff:sidebar:waiting-only", "0"), 1)`);
        await reload(page);
        await sleep(1500);
        for (const sc of scenarios(projectId, count)) {
          if (only && !sc.name.includes(only)) continue;
          const list = [];
          for (let i = 0; i < runs; i++) {
            await page.evaluate(`(async () => { ${sc.setup} })()`);
            await sleep(1200);
            list.push(await measure(page, sc));
          }
          // トレースは別の 1 回で取る（プロファイルと重ねると、どちらの時間も伸びるため）
          let traced = null;
          if (trace) {
            await page.evaluate(`(async () => { ${sc.setup} })()`);
            await sleep(1200);
            traced = await measureTrace(page, sc);
          }
          const pick = (k) => summarize(list.map((r) => r[k] ?? 0)).median;
          results.push({ name: sc.name, firstMs: pick("firstMs"), longest: pick("longest"), paintMs: pick("paintMs"), scriptMs: pick("scriptMs"), layoutMs: pick("layoutMs"), styleMs: pick("styleMs"), taskMs: pick("taskMs"), react: pick("react"), app: pick("app"), nodes: pick("nodes"), trace: traced, runs: list });
        }
      } finally {
        // 差し替えを外してから戻す（戻したあとの読み込み直しに偽のチャットを入れない）
        if (scriptId) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId }).catch(() => {});
      }
    });
  } finally {
    page.close();
  }
  return { count, projectId, groups, results };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { count: { type: "string", default: "1000" }, project: { type: "string", default: perfDefaults().project }, fixture: { type: "boolean" }, groups: { type: "string", default: "8" }, runs: { type: "string", default: "3" }, only: { type: "string" }, trace: { type: "boolean" }, json: { type: "boolean" } } });
  const r = await measureLists({ count: Number(values.count), projectId: Number(values.project), groups: Number(values.groups), runs: Number(values.runs), only: values.only, trace: values.trace });
  if (values.json) console.log(JSON.stringify(r, null, 1));
  else {
    console.log(`偽のチャット ${r.count} 件（プロジェクト ${r.projectId}・グループ ${r.groups}）。中央値:`);
    for (const m of r.results) {
      console.log(`${m.name}: 最初に見えるまで ${m.firstMs}ms・すべて描くまで ${m.paintMs}ms・いちばん長いタスク ${m.longest}ms・JS ${m.scriptMs}ms（React ${m.react}・アプリ ${m.app}）・レイアウト ${m.layoutMs}ms・スタイル ${m.styleMs}ms・タスク ${m.taskMs}ms・DOM ${m.nodes}（行 ${m.runs[0].rows}・カード ${m.runs[0].cards}・高さ 行 ${m.runs[0].rowH}/カード ${m.runs[0].cardH}/リスト ${m.runs[0].listH}）`);
      if (m.trace) console.log(`    トレース（最初に見えるまで ${m.trace.firstMs}ms・すべて ${m.trace.paintMs}ms）の自分の時間:`, JSON.stringify(m.trace.trace));
      else m.runs[0].top.forEach((t) => console.log("    ", String(t.ms).padStart(7), t.label));
    }
  }
}
