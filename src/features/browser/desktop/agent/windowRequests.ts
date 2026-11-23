// 画面（メインのウィンドウ・別ウィンドウ）への頼みと知らせ。どの画面にタブ・チャット欄があるか分からないので、すべての画面に送る
import type { WebContents } from "electron";
import { appWindows, broadcast } from "@/foundation/desktop/app/popouts";
import { withTimeout } from "@shared/foundation/time";
import { gatherReplies } from "@/features/browser/desktop/gatherReplies";

/** 最後の操作から、これだけたったら「AI 操作中」の印を消す */
const ACTIVITY_MS = 30_000;

/** 頼んだ画面の返事（頼みの番号ごと） */
const pending = new Map<number, (reply: never) => void>();
let nextRequest = 1;
/** タブのキーごとの、印を消すタイマー */
const activity = new Map<string, NodeJS.Timeout>();

/**
 * すべての画面に頼み、返事を集める（ok の返事が来たらそれ、全部が ok でなければ最後の返事）。画面がなければ null。
 * timeoutMs のうちに集まらなければ message のエラー
 */
export async function askWindows<T>(send: (wc: WebContents, requestId: number) => void, opts: { ok: (reply: T) => boolean; timeoutMs: number; message: string }): Promise<T | null> {
  const wins = appWindows();
  if (wins.length === 0) return null;
  const requestId = nextRequest++;
  const reply = new Promise<T>((resolve) => pending.set(requestId, gatherReplies<T>(wins.length, opts.ok, resolve) as (reply: never) => void));
  for (const win of wins) send(win.webContents, requestId);
  return withTimeout(reply, opts.timeoutMs, opts.message).finally(() => pending.delete(requestId));
}

/** 画面の返事を渡す（IPC の agentBrowser.opened・revealed） */
export function answerWindow<T>(requestId: number, reply: T) {
  (pending.get(requestId) as ((reply: T) => void) | undefined)?.(reply);
}

/** AI がこのタブを操作した（すべての画面に「AI 操作中」の印を出させ、しばらく操作がなければ消させる。タブのない画面は何もしない） */
export function touchTab(tabKey: string) {
  clearTimeout(activity.get(tabKey));
  broadcast("agentBrowser", "onActivity", tabKey, true);
  activity.set(
    tabKey,
    setTimeout(() => {
      activity.delete(tabKey);
      broadcast("agentBrowser", "onActivity", tabKey, false);
    }, ACTIVITY_MS),
  );
}
