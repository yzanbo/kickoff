// AI（チャットのエージェント）に埋め込みブラウザを操作させる口（コアの BrowserControl の実装）。タブの登録簿は tabRegistry.ts、
// 画面への頼みと「AI 操作中」の知らせは windowRequests.ts、ページへの操作は pageActions.ts。
// 画面のブラウザのタブは、webview の準備ができたら自分を登録する（agentBrowser.register。タブのキーとプロジェクト）。
// AI が新しいタブを開くときは、画面に頼んでそのプロジェクトのチャット欄にタブを足させ、その webview が登録されるのを待つ。
// 操作したタブは画面に知らせ（onActivity）、タブに「AI 操作中」の印を出し、表に出ていなくても見えない形で並べさせる（撮る・押すため）。
// 作業の初めに使うタブは、画面に頼んで欄を開いて表に出させ（onRevealRequest。キーボードのピントは動かさない）、並び終えるのを待ってから操作する

import type { BrowserControl, HistoryAction, PageSnapshot } from "@shared/browser/control";
import { sleep } from "@shared/foundation/time";
import { sendEvent, type IpcHandlers } from "@/foundation/desktop/ipc/register";
import { webviewConsoleOf } from "@/features/browser/desktop/webviewConsole";
import { clickScript, pointScript, scrollScript, SNAPSHOT_SCRIPT, typeScript } from "@/features/browser/desktop/pageScripts";
import { after, handOffCapture, laidOut, LOAD_TIMEOUT_MS, run, sendKey, settle, settledLayout, shoot, truncate } from "./pageActions";
import { afterKeyOf, entryOf, infoOf, liveEntries, liveEntry, registerTab, tabKeyOf, unregisterTab, waitForTab } from "./tabRegistry";
import { answerWindow, askWindows, touchTab } from "./windowRequests";

/** 画面がタブを足して、その webview が登録されるまで待つ長さ */
const OPEN_TIMEOUT_MS = 15_000;
/** 画面が表に出す頼みに答えるのを待つ長さ */
const REVEAL_TIMEOUT_MS = 3000;

/** 画面に頼んだタブの開き方の返事 */
type OpenReply = { tabKey: string; revealed: boolean } | { error: string };

export const agentBrowser: BrowserControl = {
  tabs: async () => liveEntries().map(infoOf),

  async open(projectId, url, reveal) {
    const after = reveal ? afterKeyOf(reveal) : undefined;
    // 前に表に出したタブがもう閉じていれば、利用者は見ていないので表に出さない
    const show = reveal !== null && after !== undefined;
    // チャット欄はメインのウィンドウか別ウィンドウにあるので、どちらにも頼み、そのプロジェクトのチャット欄を出している画面が答える
    const result = await askWindows<OpenReply>((wc, requestId) => sendEvent(wc, "agentBrowser", "onOpenRequest", requestId, projectId, url, show, after ?? null), {
      ok: (r) => !("error" in r),
      timeoutMs: 5000,
      message: "Kickoff の画面が応答しません",
    });
    if (result === null) throw new Error("Kickoff の画面が開いていません");
    if ("error" in result) throw new Error(result.error);
    const entry = await waitForTab(result.tabKey, OPEN_TIMEOUT_MS, "タブを開きましたが、ページの準備が終わりませんでした");
    await settle(entry.wc, 0);
    if (result.revealed) await settledLayout(entry.wc);
    return { tab: infoOf(entry), revealed: result.revealed };
  },

  async reveal(tabId, request) {
    const entry = liveEntry(tabId);
    const after = afterKeyOf(request);
    if (!entry || after === undefined) return false;
    // タブのある画面が答える（ほかの画面は出さなかったと答える）
    const shown = await askWindows<boolean>((wc, requestId) => sendEvent(wc, "agentBrowser", "onRevealRequest", requestId, entry.tabKey, after), {
      ok: (s) => s,
      timeoutMs: REVEAL_TIMEOUT_MS,
      message: "Kickoff の画面が応答しません",
    }).catch(() => false);
    if (shown) await settledLayout(entry.wc);
    return shown === true;
  },

  async navigate(tabId, url) {
    const entry = entryOf(tabId);
    // 中断（-3）は、すぐ別のページへ移った（転送など）ときなので失敗にしない。長くかかれば読み込み中のまま返す
    const loading = entry.wc.loadURL(url).then(
      () => null,
      (e: { errno?: number; message?: string }) => e,
    );
    const failed = await Promise.race([loading, sleep(LOAD_TIMEOUT_MS).then(() => null)]);
    if (failed && failed.errno !== -3) throw new Error(`開けませんでした: ${failed.message ?? url}`);
    return infoOf(entry);
  },

  async history(tabId, action: HistoryAction) {
    const entry = entryOf(tabId);
    const history = entry.wc.navigationHistory;
    if (action === "back") {
      if (!history.canGoBack()) throw new Error("戻れるページがありません");
      history.goBack();
    } else if (action === "forward") {
      if (!history.canGoForward()) throw new Error("進めるページがありません");
      history.goForward();
    } else entry.wc.reload();
    await settle(entry.wc);
    return infoOf(entry);
  },

  async read(tabId) {
    const { wc } = entryOf(tabId);
    await laidOut(wc);
    return run<PageSnapshot>(wc, SNAPSHOT_SCRIPT);
  },

  async screenshot(tabId) {
    const { data } = await shoot(entryOf(tabId).wc);
    return { data, mimeType: "image/jpeg" };
  },

  async click(tabId, ref) {
    const entry = entryOf(tabId);
    const { wc } = entry;
    await laidOut(wc);
    const point = await run<{ x: number; y: number; width: number; height: number; name: string; hit: boolean } | null>(wc, pointScript(ref));
    if (!point) throw new Error(`ref=${ref} の要素がありません（ページが変わった可能性があります）。browser_read で読み直してください。`);
    const inside = point.width > 0 && point.x >= 0 && point.y >= 0 && point.x < point.width && point.y < point.height;
    if (inside && point.hit) {
      // 利用者と同じく、その位置を押す（ページのクリックの扱いがそのまま動く）
      const at = { x: Math.round(point.x), y: Math.round(point.y) };
      wc.sendInputEvent({ type: "mouseMove", ...at });
      wc.sendInputEvent({ type: "mouseDown", ...at, button: "left", clickCount: 1 });
      wc.sendInputEvent({ type: "mouseUp", ...at, button: "left", clickCount: 1 });
    } else if (!(await run<boolean>(wc, clickScript(ref)))) throw new Error(`ref=${ref} の要素がありません`);
    return after(entry, `押しました: [${ref}] ${point.name || "(名前なし)"}`);
  },

  async type(tabId, ref, text, submit) {
    const entry = entryOf(tabId);
    const result = await run<"missing" | "submitted" | "typed">(entry.wc, typeScript(ref, text, submit));
    if (result === "missing") throw new Error(`ref=${ref} の要素がありません（ページが変わった可能性があります）。browser_read で読み直してください。`);
    // フォームのない入力欄（検索欄など）は Enter で送る
    if (submit && result === "typed") sendKey(entry.wc, "Enter");
    return after(entry, submit ? "入れて送りました" : "入れました");
  },

  async press(tabId, key) {
    const entry = entryOf(tabId);
    sendKey(entry.wc, key);
    return after(entry, `${key} を押しました`);
  },

  async scroll(tabId, direction) {
    const { wc } = entryOf(tabId);
    await laidOut(wc);
    return run<string>(wc, scrollScript(direction));
  },

  async evaluate(tabId, script) {
    const { wc } = entryOf(tabId);
    let value: unknown;
    try {
      value = await run<unknown>(wc, script);
    } catch (e) {
      throw new Error(`実行に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (value === undefined) return "undefined";
    return truncate(typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value)));
  },

  consoleLogs: async (tabId) => webviewConsoleOf(entryOf(tabId).wc.id),

  touch(tabId) {
    const tabKey = tabKeyOf(tabId);
    if (tabKey !== undefined) touchTab(tabKey);
  },
};

/** AI のブラウザ操作（IPC の agentBrowser） */
export const agentBrowserHandlers: IpcHandlers["agentBrowser"] = {
  register: registerTab,
  unregister: (_e, webContentsId) => unregisterTab(webContentsId),
  opened: (_e, requestId, tabKey, revealed, error) => answerWindow<OpenReply>(requestId, tabKey ? { tabKey, revealed } : { error: error ?? "タブを開けませんでした" }),
  revealed: (_e, requestId, shown) => answerWindow(requestId, shown),
  handOffCapture,
};
