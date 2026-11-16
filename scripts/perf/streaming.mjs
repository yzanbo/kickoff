// 返答を書いている最中を作る補助: 確かめ用のチャットに「数字を 1500 行」の依頼を送り、終わったら止める。
// 2 回目からは前の依頼の発言まで巻き戻して送り直すので、測るたびにチャットの記録が増えない
import { api, sleep } from "./cdp.mjs";

export const STREAM_PROMPT =
  "表示の速さを測る試験です。確認や前置きはせず、1 から 1500 まで、数字を 1 行に 1 つずつ、途中で止めずにすべて書いてください。各行に「番目の行です。今日はいい天気です」と添えてください。ツールは使わないでください。";

/** 書いている最中にする（前の依頼があれば巻き戻して送り直す） */
export async function startStreaming(chatId) {
  const detail = await api("GET", `/api/chats/${chatId}?limit=200`);
  if (detail.chat.status === "running") throw new Error(`チャット ${chatId} は作業中です`);
  const last = [...detail.events].reverse().find((e) => e.type === "user");
  if (last && last.data.text === STREAM_PROMPT) await api("POST", `/api/chats/${chatId}/rewind`, { event_id: last.id, text: STREAM_PROMPT, options: {} });
  else await api("POST", `/api/chats/${chatId}/messages`, { text: STREAM_PROMPT, options: {} });
}

/** 止めて、作業中でなくなるまで待つ */
export async function stopStreaming(chatId) {
  await api("POST", `/api/chats/${chatId}/cancel`).catch(() => undefined);
  for (let i = 0; i < 100; i++) {
    const { chat } = await api("GET", `/api/chats/${chatId}?limit=1`);
    if (chat.status !== "running") return;
    await sleep(200);
  }
}

/** 画面に書きかけの返答が minChars 文字より多く出るまで待つ（出た文字数。出ないまま作業が終わったら null） */
export async function waitLiveText(page, chatId, minChars = 300, timeoutMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const n = await page.evaluate(`document.querySelector(".assistant.live")?.textContent.length ?? 0`);
    if (n > minChars) return n;
    // AI が書かずに短く答えて終わった（長すぎると断るなど）
    if (Date.now() - t0 > 3000 && (await api("GET", `/api/chats/${chatId}?limit=1`)).chat.status !== "running") return null;
    await sleep(300);
  }
  throw new Error("書きかけの返答が画面に出ません");
}

/** 書いている最中にして、書きかけの返答が画面に出るまで待つ（AI が書かずに終えたら 3 回まで送り直す） */
export async function startStreamingLive(page, chatId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await startStreaming(chatId);
    const chars = await waitLiveText(page, chatId);
    if (chars !== null) return chars;
  }
  throw new Error("AI が 3 回続けて書かずに答えました");
}
