// 案 18b の比べ方: 一通り開いたあと、GC を何度も起こして使っていない関数のバイトコードを古びさせ（長く放っておいたのに近い形）、
// 戻ってからの操作（ボード・長いチャット・設定）の JS の時間とコンパイルの合計時間、画面のメモリを出す。
// node scripts/perf/bytecode-flush.mjs [--project 21] [--chat 224] [--gc 12] [--idle 0]（--idle は GC の前に待つ分）
import { parseArgs } from "node:util";
import { connectPage, sleep } from "./cdp.mjs";

const { values } = parseArgs({ options: { project: { type: "string", default: "21" }, chat: { type: "string", default: "224" }, gc: { type: "string", default: "12" }, idle: { type: "string", default: "0" } } });
const page = await connectPage();
// 窓が隠れていると rAF が止まるので、操作のあと 1.2 秒の間に JS が使った時間（getMetrics の ScriptDuration の差）で比べる
await page.send("Performance.enable");
const scriptMs = async () => (await page.send("Performance.getMetrics")).metrics.find((m) => m.name === "ScriptDuration").value * 1000;
let mark = 0;
const go = async (hash) => {
  mark = await scriptMs();
  await page.evaluate(`(location.hash = ${JSON.stringify(hash)}, 1)`);
  await sleep(1200);
  const ms = Math.round((await scriptMs()) - mark);
  await sleep(300);
  return ms;
};
const settings = async () => {
  mark = await scriptMs();
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: ",", code: "Comma", modifiers: 4, windowsVirtualKeyCode: 188 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: ",", code: "Comma", modifiers: 4, windowsVirtualKeyCode: 188 });
  await sleep(1200);
  const ms = Math.round((await scriptMs()) - mark);
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(800);
  return ms;
};
const memory = async () => {
  const heap = await page.evaluate(`Math.round(performance.memory.usedJSHeapSize / 1048576)`);
  return { heapMB: heap };
};
const p = values.project;
const chat = `#/projects/${p}/chats/${values.chat}`;
// 一通り開く
for (const h of [chat, `#/projects/${p}`, `#/projects/${p}/files`, `#/projects/${p}/memos`, "#/"]) await go(h);
await settings();
await go("#/");
await page.send("HeapProfiler.enable");
const before = await memory();
// 待ってから GC を起こす（V8 のバイトコードの古びは、GC の回数だけでなく経った時間でも決まるため）
if (Number(values.idle) > 0) await sleep(Number(values.idle) * 60_000);
for (let i = 0; i < Number(values.gc); i++) { await page.send("HeapProfiler.collectGarbage"); await sleep(300); }
const aged = await memory();
// 戻って操作する（トレースでコンパイルの時間を取る）
const events = [];
let finish;
const done = new Promise((r) => (finish = r));
page.on((m) => {
  if (m.method === "Tracing.dataCollected") events.push(...m.params.value);
  if (m.method === "Tracing.tracingComplete") finish();
});
await page.send("Tracing.start", { categories: "v8,disabled-by-default-v8.compile", transferMode: "ReportEvents" });
const times = { board: await go(`#/projects/${p}`), chat: await go(chat), settings: await settings() };
await page.send("Tracing.end");
await done;
const compile = {};
for (const e of events) {
  if (e.ph !== "X" || !/compile|Compile/.test(`${e.cat} ${e.name}`)) continue;
  compile[e.name] = (compile[e.name] ?? 0) + (e.dur ?? 0) / 1000;
}
const compileMs = Math.round(Object.values(compile).reduce((a, b) => a + b, 0));
console.log(JSON.stringify({ times, total: times.board + times.chat + times.settings, compileMs, compile: Object.fromEntries(Object.entries(compile).map(([k, v]) => [k, Math.round(v)])), before, aged, events: events.length }));
page.close();
