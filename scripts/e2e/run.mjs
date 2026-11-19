// 合否の付く通しの確かめ。決まったデータの開発版（npm run fixture:seed → npm run dev:fixture。CDP 9335・コア 4319）につなぎ、
// scripts/e2e/scenarios/<名前>.mjs を名前の順に（名前を渡せばそれだけ）流す。
//
//   node scripts/e2e/run.mjs [名前…]
//
// 1 本の形は { name, title, setup(ctx), act(ctx), expect(ctx), cleanup?(ctx) }。expect が投げたら落ちた本として名前と期待・実際を出す。
// 1 本ごとに localStorage を保存して流し、終わったら戻す（cleanup は落ちても流す。API で変えたものを戻す）。
// 画面の時計は決まった起点（FIXTURE.now）から進める。1 本でも落ちれば終了コード 1。AI に送る操作は入れない（開発版に選べる偽の AI がないため）。
// コミットのフックには入れない（遅く、画面の動きで揺れうるため）。段ごとに手で流す
import fs from "node:fs";
import path from "node:path";
import { api, cdpPort, connectPage, press, resetPage, withSavedStorage } from "../devtools/cdp.mjs";
import { fixedClockSource } from "../devtools/clock.mjs";
import { FIXTURE, readFixture } from "../devtools/fixture.mjs";

const SCENARIOS_DIR = path.join(import.meta.dirname, "scenarios");

/** 画面の式が真になるまで待ち、その値を返す（rAF ごと。窓が隠れて rAF が来なくても 50ms ごとに見る）。決め打ちの時間では待たない */
async function waitFor(page, expr, label, { timeoutMs = 5000 } = {}) {
  const value = await page.evaluate(`(async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < ${timeoutMs}) {
      const value = await (async () => (${expr}))();
      if (value) return value;
      await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 50); });
    }
    return null;
  })()`);
  if (!value) throw new Error(`${timeoutMs / 1000} 秒待っても「${label}」になりません`);
  return value;
}

/** 1 本に渡す道具（state は setup・act・expect の間で値を受け渡す入れ物） */
function makeContext(page, fixture, scripts) {
  return {
    page,
    fixture,
    state: {},
    /** 決まったデータの開発版の API */
    api: (method, route, body) => api(method, route, body, { port: FIXTURE.api, dataDir: FIXTURE.dataDir }),
    /** 保存を空にして（local だけを置き）hash の画面を読み込み直す */
    open: (hash, local = {}) => resetPage(page, { local, hash, clearSession: true }),
    press: (key, modifiers) => press(page, key, modifiers),
    eval: (expr) => page.evaluate(expr),
    waitFor: (expr, label, opts) => waitFor(page, expr, label, opts),
    /** 次に読み込む画面から流す文を足す（その本が終わったら外す） */
    addScript: async (source) => scripts.push((await page.send("Page.addScriptToEvaluateOnNewDocument", { source })).identifier),
  };
}

/** 1 本を流す。通れば null、落ちれば理由 */
async function runOne(page, fixture, scenario) {
  const scripts = [];
  const ctx = makeContext(page, fixture, scripts);
  try {
    await withSavedStorage(page, async () => {
      try {
        await scenario.setup(ctx);
        await scenario.act(ctx);
        await scenario.expect(ctx);
      } finally {
        // 戻す読み込み直しに差し替えを持ち込まない
        for (const identifier of scripts) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => {});
        await scenario.cleanup?.(ctx);
      }
    });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const files = fs.readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith(".mjs")).sort();
const chosen = names.length ? names.map((n) => `${n}.mjs`) : files;
const unknown = chosen.filter((f) => !files.includes(f));
if (unknown.length) {
  console.error(`知らない通しの確かめ: ${unknown.join("・")}（あるもの: ${files.map((f) => f.slice(0, -4)).join("・")}）`);
  process.exit(2);
}

const fixture = readFixture();
const page = await connectPage({ port: cdpPort([...process.argv, "--fixture"]) });
const started = Date.now();
const failed = [];
try {
  await page.send("Page.enable");
  const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: fixedClockSource(FIXTURE.now) });
  try {
    for (const file of chosen) {
      const { default: scenario } = await import(path.join(SCENARIOS_DIR, file));
      const t0 = Date.now();
      const error = await runOne(page, fixture, scenario);
      const seconds = ((Date.now() - t0) / 1000).toFixed(1);
      if (error) {
        failed.push(scenario.name);
        console.log(`✗ ${scenario.name}（${scenario.title}）${seconds} 秒\n${error.replace(/^/gm, "    ")}`);
      } else console.log(`✓ ${scenario.name}（${scenario.title}）${seconds} 秒`);
    }
  } finally {
    await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => {});
  }
} finally {
  page.close();
}
console.log(`${chosen.length} 本中 ${chosen.length - failed.length} 本が通った（${((Date.now() - started) / 1000).toFixed(0)} 秒）${failed.length ? `。落ちた: ${failed.join("・")}` : ""}`);
if (failed.length) process.exitCode = 1;
