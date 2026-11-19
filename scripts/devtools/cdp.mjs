// 開発版（npm run dev:cdp。CDP のポート 9333）の画面に CDP でつなぐ補助。開発版を操る道具（scripts/ の点検・scripts/perf/ の測る道具）が共通に使う。
// 開発版の窓は前に出さない（Input.dispatchKeyEvent は窓が後ろにあっても届く）。製品版（ポート 4317）には触らない
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FIXTURE, usesFixture } from "./fixture.mjs";

/** 開発版の既定の保存先（npm run dev のとき） */
const DEV_DATA_DIR = path.join(os.homedir(), "Library/Application Support/Kickoff Dev");

/** 引数の値（`--name value` か `--name=value`。なければ undefined） */
function argValue(argv, name) {
  const flag = `--${name}`;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag) return argv[i + 1];
    if (argv[i].startsWith(`${flag}=`)) return argv[i].slice(flag.length + 1);
  }
  return undefined;
}

/** CDP のポート: 引数 --cdp <port> > 引数 --fixture（決まったデータの開発版 9335）> 環境変数 KICKOFF_REMOTE_DEBUG > 9333 */
export function cdpPort(argv = process.argv) {
  return Number(argValue(argv, "cdp") ?? (usesFixture(argv) ? FIXTURE.cdp : undefined) ?? process.env.KICKOFF_REMOTE_DEBUG ?? 9333);
}

/** コアのポート: 引数 --api <port> > 引数 --fixture（4319）> 環境変数 KICKOFF_PORT > 4318 */
export function apiPort(argv = process.argv) {
  return Number(argValue(argv, "api") ?? (usesFixture(argv) ? FIXTURE.api : undefined) ?? process.env.KICKOFF_PORT ?? 4318);
}

/** 開発版の保存先: 引数 --data <dir> > 引数 --fixture（/private/tmp/kickoff-fixture/data）> 既定の Kickoff Dev */
function dataDirOf(argv = process.argv) {
  const dir = argValue(argv, "data");
  return dir ? path.resolve(dir) : usesFixture(argv) ? FIXTURE.dataDir : DEV_DATA_DIR;
}

/** アプリの画面の URL（開発の Vite・コアが配る画面。後ろはハッシュ・クエリか終わり） */
const APP_URL = /^https?:\/\/(localhost|127\.0\.0\.1):\d+\/(index\.html)?([#?]|$)/;

/** CDP の一覧から、アプリの画面（別ウィンドウ #/popout/・webview・devtools を除く page）を選ぶ（純粋。なければ null） */
export function findAppPage(targets) {
  return targets.find((t) => t.type === "page" && APP_URL.test(t.url) && !t.url.includes("#/popout/")) ?? null;
}

/** CDP の一覧・版を取る（開発版が動いていなければ、起動のしかたを添えて投げる） */
async function fetchJson(port, route) {
  try {
    return await (await fetch(`http://127.0.0.1:${port}${route}`)).json();
  } catch (e) {
    throw new Error(`開発版の CDP（ポート ${port}）につなげません。npm run dev:cdp（9333）か npm run dev:fixture（9335。先に npm run fixture:seed）で起動してください（${e.message}）`);
  }
}

/** 1 つの CDP の呼び出しの答えを待つ上限（測る道具の長い式も入る長さ） */
const SEND_TIMEOUT_MS = 120_000;

/** WebSocket の CDP の口（send・on・close）。切れたら、答えを待っている呼び出しを失敗にする */
async function openSession(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error(`CDP につなげません: ${url}`)), { once: true });
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);
    if (d.id !== undefined && pending.has(d.id)) {
      const { resolve, reject } = pending.get(d.id);
      pending.delete(d.id);
      if (d.error) reject(new Error(`${d.error.message} ${d.error.data ?? ""}`));
      else resolve(d.result);
    } else if (d.method) listeners.forEach((fn) => fn(d));
  });
  ws.addEventListener("close", () => {
    for (const { reject } of pending.values()) reject(new Error("CDP の接続が切れました"));
    pending.clear();
  });
  // 画面が固まったときに待ち続けないよう、答えを待つのは SEND_TIMEOUT_MS まで
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      const timer = setTimeout(() => {
        pending.delete(i);
        reject(new Error(`CDP の ${method} の答えが ${SEND_TIMEOUT_MS / 1000} 秒ありません（画面が固まっている）`));
      }, SEND_TIMEOUT_MS);
      const settle = (fn) => (value) => (clearTimeout(timer), fn(value));
      pending.set(i, { resolve: settle(resolve), reject: settle(reject) });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { send, on: (fn) => (listeners.add(fn), () => listeners.delete(fn)), close: () => ws.close() };
}

/** アプリの画面（メインのウィンドウ）につなぐ（send・evaluate・on・close）。evaluate は画面の式の例外を Error にして投げる */
export async function connectPage({ port = cdpPort() } = {}) {
  const page = findAppPage(await fetchJson(port, "/json"));
  if (!page) throw new Error(`開発版の画面が見つかりません（CDP ${port}）。npm run dev:cdp か npm run dev:fixture で起動してください`);
  const session = await openSession(page.webSocketDebuggerUrl);
  /** 画面で式を評価して値を返す（Promise は待つ） */
  const evaluate = async (expression) => {
    const r = await session.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(`画面の式が失敗しました: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result?.value;
  };
  return { ...session, evaluate };
}

/** ブラウザ全体につなぐ（Browser.close など。/json/version） */
export async function connectBrowser({ port = cdpPort() } = {}) {
  const version = await fetchJson(port, "/json/version");
  return openSession(version.webSocketDebuggerUrl);
}

/** 開発版の API の鍵（<保存先>/token。保存先は引数 --data > --fixture > 既定の Kickoff Dev） */
export function devToken(dataDir = dataDirOf()) {
  return readFileSync(path.join(dataDir, "token"), "utf8").trim();
}

/** 開発版の HTTP API を呼ぶ（JSON を返す） */
export async function api(method, route, body, { port = apiPort(), dataDir } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    headers: { Authorization: `Bearer ${devToken(dataDir)}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** 読み込み直す前の画面に付ける印（印のない画面になったら、読み込み直しが済んだ） */
const RELOADING = "__kickoffCdpReloading";

/** 読み込み直した画面にサイドバーが出るまで待つ */
async function waitReloaded(page, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    // 読み込みの途中は式を評価できないことがある（そのときは待つ）
    if (await page.evaluate(`!window.${RELOADING} && !!document.querySelector(".sidebar")`).catch(() => false)) return;
    await sleep(200);
  }
  throw new Error("読み込み直したあとサイドバーが出ません");
}

/** 読み込み直し、サイドバーが出るまで待つ */
export async function reload(page, { timeoutMs = 30000 } = {}) {
  await page.evaluate(`(window.${RELOADING} = true, 1)`);
  await page.send("Page.reload", { ignoreCache: false });
  await waitReloaded(page, timeoutMs);
}

/**
 * localStorage を local の中身だけにし、ハッシュを hash にして読み込み直す（clearSession なら sessionStorage も空にする）。
 * setItem と reload を同じ evaluate でする（setItem だけだと、画面の覚えた値で上書きされる）。サイドバーが出るまで待つ
 */
export async function resetPage(page, { local, hash, clearSession = false }, { timeoutMs = 30000 } = {}) {
  // 読み込み直す前に前の画面のごみを片付ける（大きな記録を取りながら読み込み直しを 30 回ほど続けると、片付かない前の文書でメモリが 400MB を超え、
  // 読み込み直した画面が答えなくなった。片付けてからなら 60 回続けても 100MB に収まる）
  await page.send("HeapProfiler.collectGarbage");
  await page.evaluate(
    `(() => { const ls = ${JSON.stringify(local)}; localStorage.clear(); ${clearSession ? "sessionStorage.clear();" : ""} for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); window.${RELOADING} = true; location.hash = ${JSON.stringify(hash)}; location.reload(); return 1; })()`,
  );
  await waitReloaded(page, timeoutMs);
  // 画面の知っているマウスの位置を窓の外にする（利用者のマウスが窓の上で止まっていると、出てきた一覧の行に乗った扱いになり、選ぶ行が変わる）
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: -1, y: -1 });
}

/**
 * localStorage（とハッシュ）を保存して fn を流し、終わったら戻して読み直す。
 * 戻せなかったら、fn の結果を消さずにエラーを出して終了コードを 1 にする
 */
export async function withSavedStorage(page, fn) {
  const saved = JSON.parse(await page.evaluate(`JSON.stringify({ hash: location.hash, ls: Object.fromEntries(Object.entries(localStorage)) })`));
  try {
    return await fn();
  } finally {
    try {
      await resetPage(page, { local: saved.ls, hash: saved.hash });
    } catch (e) {
      console.error(`localStorage を元に戻せませんでした: ${e.message}`);
      process.exitCode = 1;
    }
  }
}

/** キーの名前から CDP の code と仮想キーの番号（押すキーを足すときはここに） */
const KEYS = {
  ",": ["Comma", 188],
  Enter: ["Enter", 13],
  Escape: ["Escape", 27],
  ArrowDown: ["ArrowDown", 40],
  ArrowUp: ["ArrowUp", 38],
  Tab: ["Tab", 9],
  Backspace: ["Backspace", 8],
};

/**
 * 画面にキーを押す（CDP の Input.dispatchKeyEvent。窓を前に出さない）。key は 1 文字か KEYS の名前。
 * 修飾キーは { meta, shift, alt, ctrl }。修飾キーなしの 1 文字は文字として入る
 */
export async function press(page, key, { meta = false, shift = false, alt = false, ctrl = false } = {}) {
  const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
  const [code, keyCode] = KEYS[key] ?? (/^[a-z]$/i.test(key) ? [`Key${key.toUpperCase()}`, key.toUpperCase().charCodeAt(0)] : /^[0-9]$/.test(key) ? [`Digit${key}`, key.charCodeAt(0)] : ["", 0]);
  const text = key.length === 1 && !meta && !ctrl ? key : undefined;
  await page.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, modifiers, windowsVirtualKeyCode: keyCode, text });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers, windowsVirtualKeyCode: keyCode });
}

/** Performance.getMetrics の値を名前で引けるようにする（ScriptDuration・LayoutDuration・RecalcStyleDuration は秒） */
export async function metrics(page) {
  const { metrics: list } = await page.send("Performance.getMetrics");
  return Object.fromEntries(list.map((m) => [m.name, m.value]));
}

/** 2 つの getMetrics の差を ms で（スクリプト・レイアウト・スタイルの再計算・タスク全体） */
export function metricsDelta(before, after) {
  const ms = (k) => Math.round(((after[k] ?? 0) - (before[k] ?? 0)) * 1000);
  return { scriptMs: ms("ScriptDuration"), layoutMs: ms("LayoutDuration"), styleMs: ms("RecalcStyleDuration"), taskMs: ms("TaskDuration"), layouts: (after.LayoutCount ?? 0) - (before.LayoutCount ?? 0) };
}

/** 画面がチャットのページに移り、流れの記録が描かれるまで待つ（ms を返す） */
export const waitTimelineExpr = (timeoutMs = 20000) => `(async () => {
  const t0 = performance.now();
  while (performance.now() - t0 < ${timeoutMs}) {
    await new Promise((r) => requestAnimationFrame(r));
    if (document.querySelector(".timeline-wrap [id^='ev-']")) return performance.now() - t0;
  }
  return null;
})()`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
