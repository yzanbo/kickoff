// 入力の遅れを測る: 表に出ているチャットの入力欄に 1 文字ずつ打ち、押してから次の描画（2 回の rAF）までの時間を出す。
// node scripts/perf/typing.mjs [--chat 224] [--keys 40] [--streaming] [--json]
//   --streaming: 確かめ用のチャットに返答を書かせ、書いている最中に打つ（streaming.mjs）
import { parseArgs } from "node:util";
import { api, connectPage, metrics, metricsDelta, sleep, waitTimelineExpr } from "./cdp.mjs";
import { summarize, summarizeProfile } from "./stats.mjs";
import { startStreamingLive, stopStreaming } from "./streaming.mjs";

/** チャットの画面を開き、入力欄にピントを置く */
export async function openChat(page, chatId) {
  const { chat } = await api("GET", `/api/chats/${chatId}?limit=1`);
  await page.evaluate(`(location.hash = "#/projects/${chat.project_id}/chats/${chatId}", 1)`);
  if ((await page.evaluate(waitTimelineExpr())) === null) throw new Error("チャットが描かれません");
  await sleep(500);
}

/** 入力欄に keys 文字打って、1 文字ごとの ms・getMetrics の差・プロファイルを返す（打った文字は消す） */
export async function typeKeys(page, keys) {
  const focused = await page.evaluate(
    `(() => { const ta = [...document.querySelectorAll(".composer textarea")].find((e) => e.offsetParent); ta?.focus(); return !!ta; })()`,
  );
  if (!focused) throw new Error("入力欄が見つかりません");
  await page.send("Performance.enable");
  await page.send("Profiler.enable");
  await page.send("Profiler.setSamplingInterval", { interval: 200 });
  const before = await metrics(page);
  await page.send("Profiler.start");
  const times = [];
  for (let i = 0; i < keys; i++) {
    await page.evaluate(`(window.__perfT0 = performance.now(), 1)`);
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", text: "a", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
    times.push(await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(Math.round(performance.now() - window.__perfT0)))))`));
  }
  const { profile } = await page.send("Profiler.stop");
  const after = await metrics(page);
  // 打った文字を消す（下書きを残さない）
  await page.evaluate(
    `(() => { const ta = document.activeElement; if (ta?.tagName === "TEXTAREA") { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, ""); ta.dispatchEvent(new Event("input", { bubbles: true })); } return 1; })()`,
  );
  return { keys: summarize(times), times, metrics: metricsDelta(before, after), profile: summarizeProfile(profile, 15) };
}

/** 待機中か、返答を書いている最中に打って測る */
export async function measureTyping({ chatId = 224, keys = 40, streaming = false } = {}) {
  const page = await connectPage();
  try {
    await openChat(page, chatId);
    if (!streaming) return { mode: "idle", ...(await typeKeys(page, keys)) };
    try {
      const startChars = await startStreamingLive(page, chatId);
      const result = await typeKeys(page, keys);
      const endChars = await page.evaluate(`document.querySelector(".assistant.live")?.textContent.length ?? 0`);
      // 打っている間に文字が増えていなければ、待機中を測ったことになる
      return { mode: "streaming", liveChars: { start: startChars, end: endChars }, ...result };
    } finally {
      await stopStreaming(chatId);
    }
  } finally {
    page.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { chat: { type: "string", default: "224" }, keys: { type: "string", default: "40" }, streaming: { type: "boolean" }, json: { type: "boolean" } } });
  const r = await measureTyping({ chatId: Number(values.chat), keys: Number(values.keys), streaming: !!values.streaming });
  if (values.json) console.log(JSON.stringify(r, null, 1));
  else {
    console.log(`${r.mode} 1 文字: 中央値 ${r.keys.median}ms・95% ${r.keys.p95}ms・最大 ${r.keys.max}ms（${r.keys.n} 文字）`, r.liveChars ? `書きかけ ${r.liveChars.start}→${r.liveChars.end} 字` : "");
    console.log("getMetrics:", r.metrics);
    console.log("分類:", r.profile.categories);
    r.profile.top.forEach((t) => console.log(String(t.ms).padStart(7), t.label));
  }
}
