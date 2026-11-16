// 画面の JS のコードキャッシュが効いているかを測る（メモの仕様書「0023_表示を軽くする」の案 9・分冊 4 の 4-4）。
// ビルドしたもの（製品版と同じく、コアが out/renderer を配る）を一時の保存先で起動し、読み込み直すたびに、V8 がコンパイルした件数・時間と、
// コードキャッシュを使った件数（consumedCacheSize > 0）、HTTP のキャッシュから読んだ・304 だった数を出す。入れてある製品版・開発版の保存先には触らない。
//   npm run build
//   npm run preview:measure            （別のターミナル。CDP 9334・コア 4396・保存先は一時のフォルダ。単独で流す）
//   node scripts/measure-code-cache.mjs [--reloads 3] [--json]
// 終わったら preview:measure の窓を閉じる（⌘Q）か、このスクリプトの --quit で終わりを頼む
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { reloads: { type: "string", default: "3" }, port: { type: "string", default: process.env.KICKOFF_CDP_PORT ?? "9334" }, json: { type: "boolean" }, quit: { type: "boolean" } } });
const CDP = `http://127.0.0.1:${values.port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** CDP の口（WebSocket）につなぐ */
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);
    if (d.id !== undefined && pending.has(d.id)) {
      const { resolve, reject } = pending.get(d.id);
      pending.delete(d.id);
      if (d.error) reject(new Error(d.error.message));
      else resolve(d.result);
    } else if (d.method) for (const fn of listeners) fn(d);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { send, on: (fn) => (listeners.add(fn), () => listeners.delete(fn)), close: () => ws.close() };
}

/** 画面の 1 回の読み込み直しで、コンパイルとキャッシュを数える */
async function measureReload(browser, page) {
  const events = [];
  const offData = browser.on((m) => {
    if (m.method === "Tracing.dataCollected") events.push(...m.params.value);
  });
  const done = new Promise((resolve) => {
    const off = browser.on((m) => {
      if (m.method === "Tracing.tracingComplete") {
        off();
        resolve();
      }
    });
  });
  const responses = { total: 0, fromCache: 0, notModified: 0 };
  const offNet = page.on((m) => {
    if (m.method !== "Network.responseReceived" || !m.params.response.url.includes("/assets/")) return;
    responses.total++;
    if (m.params.response.fromDiskCache || m.params.response.fromMemoryCache) responses.fromCache++;
    if (m.params.response.status === 304) responses.notModified++;
  });
  await browser.send("Tracing.start", { categories: "devtools.timeline,v8,disabled-by-default-v8.compile", transferMode: "ReportEvents" });
  const t0 = Date.now();
  await page.send("Page.reload", {});
  // 画面が描けるまで（サイドバーか骨組みが替わるまで）待ち、そのあとの読み込みも拾えるよう少し待つ
  for (let i = 0; i < 100; i++) {
    const r = await page.send("Runtime.evaluate", { expression: "!!document.querySelector('.sidebar, .project-page, .page')", returnByValue: true }).catch(() => null);
    if (r?.result?.value) break;
    await sleep(100);
  }
  const shownMs = Date.now() - t0;
  await sleep(2000);
  await browser.send("Tracing.end");
  await done;
  offData();
  offNet();
  const compiles = events.filter((e) => (e.name === "v8.compile" || e.name === "v8.compileModule") && String(e.args?.data?.url ?? e.args?.fileName ?? "").includes("/assets/"));
  const usedCache = compiles.filter((e) => (e.args?.data?.consumedCacheSize ?? 0) > 0);
  const ms = (list) => Math.round(list.reduce((sum, e) => sum + (e.dur ?? 0), 0) / 100) / 10;
  return { shownMs, compiles: compiles.length, compileMs: ms(compiles), usedCache: usedCache.length, ...responses };
}

const version = await (await fetch(`${CDP}/json/version`)).json();
const targets = await (await fetch(`${CDP}/json`)).json();
const target = targets.find((t) => t.type === "page" && /^https?:\/\/(localhost|127\.0\.0\.1):\d+\//.test(t.url) && !t.url.includes("popout"));
if (!target) throw new Error(`画面が見つかりません（CDP ${values.port}）。npm run preview:measure で起動してください`);
const browser = await connect(version.webSocketDebuggerUrl);
const page = await connect(target.webSocketDebuggerUrl);
await page.send("Page.enable");
await page.send("Network.enable");
await page.send("Runtime.enable");
const rows = [];
for (let i = 0; i < Number(values.reloads); i++) rows.push({ reload: i + 1, ...(await measureReload(browser, page)) });
if (values.json) console.log(JSON.stringify(rows, null, 1));
else
  for (const r of rows)
    console.log(
      `${r.reload} 回目: 描けるまで ${r.shownMs}ms・コンパイル ${r.compiles} 件 ${r.compileMs}ms・コードキャッシュを使った ${r.usedCache} 件・/assets/ の応答 ${r.total}（キャッシュ ${r.fromCache}・304 ${r.notModified}）`,
    );
if (values.quit) await browser.send("Browser.close").catch(() => undefined);
page.close();
browser.close();
