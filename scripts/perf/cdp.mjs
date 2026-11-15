// 開発版（npm run dev:cdp。CDP のポート 9333）の画面に CDP でつなぐ補助。測るスクリプト（scripts/perf/）が共通に使う。
// 開発版の窓は前に出さない（Input.dispatchKeyEvent は窓が後ろにあっても届く）
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const CDP_PORT = Number(process.env.KICKOFF_CDP_PORT ?? 9333);
export const API_PORT = Number(process.env.KICKOFF_PORT ?? 4318);

/** 開発版の API の鍵（保存先の token） */
export function devToken() {
  return readFileSync(path.join(os.homedir(), "Library/Application Support/Kickoff Dev/token"), "utf8").trim();
}

/** 開発版の HTTP API を呼ぶ（JSON を返す） */
export async function api(method, route, body) {
  const res = await fetch(`http://127.0.0.1:${API_PORT}${route}`, {
    method,
    headers: { Authorization: `Bearer ${devToken()}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** メインのウィンドウの画面（別ウィンドウ・埋め込みブラウザではないもの）につなぐ */
export async function connectPage() {
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const page = targets.find((t) => t.type === "page" && /^https?:\/\/(localhost|127\.0\.0\.1):\d+\/(#|$|\?)/.test(t.url) && !t.url.includes("popout"));
  if (!page) throw new Error(`開発版の画面が見つかりません（CDP ${CDP_PORT}）。npm run dev:cdp で起動してください`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
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
      if (d.error) reject(new Error(`${d.error.message} ${d.error.data ?? ""}`));
      else resolve(d.result);
    } else if (d.method) listeners.forEach((fn) => fn(d));
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  /** 画面で式を評価して値を返す（Promise は待つ） */
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(`画面の式が失敗しました: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result?.value;
  };
  return { send, evaluate, on: (fn) => (listeners.add(fn), () => listeners.delete(fn)), close: () => ws.close() };
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
