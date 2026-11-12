import { nativeImage, webContents, type IpcMainEvent, type WebContents } from "electron";
import type { BrowserControl, BrowserTabInfo, HistoryAction, PageSnapshot, RevealRequest } from "../../core/browser/control.js";
import { mainWindow } from "../app/window.js";
import { sendEvent, type IpcHandlers } from "../ipc/register.js";
import { isOurWebview } from "./devtools.js";
import { flattenOnWhite } from "./flatten.js";
import { browserKeyCode } from "./keys.js";
import { webviewConsoleOf } from "./webviewConsole.js";
import { clickScript, pointScript, scrollScript, SNAPSHOT_SCRIPT, typeScript, VIEWPORT_SCRIPT } from "./pageScripts.js";

// AI（チャットのエージェント）に埋め込みブラウザを操作させる口（コアの BrowserControl の実装）。
// 画面のブラウザのタブは、webview の準備ができたら自分を登録する（agentBrowser.register。タブのキーとプロジェクト）。
// AI が新しいタブを開くときは、画面に頼んでそのプロジェクトのチャット欄にタブを足させ、その webview が登録されるのを待つ。
// 操作したタブは画面に知らせ（onActivity）、タブに「AI 操作中」の印を出し、表に出ていなくても見えない形で並べさせる（撮る・押すため）。
// 作業の初めに使うタブは、画面に頼んで欄を開いて表に出させ（onRevealRequest。キーボードのピントは動かさない）、並び終えるのを待ってから操作する

interface Entry {
  wc: WebContents;
  tabKey: string;
  projectId: number | null;
}

/** 読み込み終えるのを待つ長さ */
const LOAD_TIMEOUT_MS = 20_000;
/** 画面がタブを足して、その webview が登録されるまで待つ長さ */
const OPEN_TIMEOUT_MS = 15_000;
/** JavaScript の実行を待つ長さ */
const EVAL_TIMEOUT_MS = 15_000;
/** 最後の操作から、これだけたったら「AI 操作中」の印を消す */
const ACTIVITY_MS = 30_000;
/** 撮る画像の幅の上限（px） */
const SHOT_MAX_WIDTH = 1280;
/** 結果の文の上限 */
const RESULT_MAX = 20_000;

/** 登録したタブ（WebContents の ID ごと） */
const entries = new Map<number, Entry>();
/** タブのキーで登録を待っているもの（AI が開いたタブ） */
const waiters = new Map<string, (entry: Entry) => void>();
/** 画面に頼んだタブの開き方の返事 */
const pendingOpens = new Map<number, (result: { tabKey: string; revealed: boolean } | { error: string }) => void>();
/** 画面に頼んだ、表に出すの返事 */
const pendingReveals = new Map<number, (shown: boolean) => void>();
/** 画面が表に出す頼みに答えるのを待つ長さ */
const REVEAL_TIMEOUT_MS = 3000;
let nextRequest = 1;
/** タブのキーごとの、印を消すタイマー */
const activity = new Map<string, NodeJS.Timeout>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function entryOf(tabId: number): Entry {
  const entry = entries.get(tabId);
  if (!entry || entry.wc.isDestroyed()) throw new Error(`tab_id=${tabId} のタブはありません（閉じられた可能性があります）。browser_tabs で確かめてください。`);
  return entry;
}

/** 表に出す頼みの after（前に表に出したタブ）を、タブのキーにする（もう閉じていれば undefined = 利用者は見ていない） */
function afterKeyOf(request: RevealRequest): string | null | undefined {
  if (request.after === null) return null;
  const entry = entries.get(request.after);
  return entry && !entry.wc.isDestroyed() ? entry.tabKey : undefined;
}

/** 表に出したタブが、開いた欄の大きさで並び終えるのを待つ（大きさが 2 回続けて同じになるまで。閉じた欄の見えない並びから変わるため） */
async function settledLayout(wc: WebContents) {
  let last = "";
  for (let i = 0; i < 20; i++) {
    const size = await run<string>(wc, "`${innerWidth}x${innerHeight}`").catch(() => "");
    if (size !== "" && size !== "0x0" && size === last) return;
    last = size;
    await sleep(50);
  }
}

const infoOf = ({ wc, projectId }: Entry): BrowserTabInfo => ({ id: wc.id, project_id: projectId, url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading() });

/** 読み込みが終わるのを待つ（始まりそうなら少し待ってから。長くかかれば、読み込み中のまま返す） */
async function settle(wc: WebContents, startGraceMs = 300) {
  await sleep(startGraceMs);
  if (wc.isDestroyed() || !wc.isLoading()) return;
  await Promise.race([new Promise<void>((resolve) => wc.once("did-stop-loading", () => resolve())), sleep(LOAD_TIMEOUT_MS)]);
}

/** ページを動かす（失敗はページの JavaScript のエラーの文にする） */
async function run<T>(wc: WebContents, script: string): Promise<T> {
  return (await withTimeout(wc.executeJavaScript(script, true), EVAL_TIMEOUT_MS, "ページが応答しません（JavaScript の実行が 15 秒で終わりませんでした）")) as T;
}

/** 見えない形でも並べられるのを待つ（表に出ていないタブは、印を受けた画面が並べ直すまで大きさが 0） */
async function laidOut(wc: WebContents): Promise<boolean> {
  for (let i = 0; i < 15; i++) {
    if (((await run<number>(wc, VIEWPORT_SCRIPT).catch(() => 0)) ?? 0) > 0) return true;
    await sleep(100);
  }
  return false;
}

const truncate = (s: string) => (s.length > RESULT_MAX ? `${s.slice(0, RESULT_MAX)}\n…（以下 ${s.length - RESULT_MAX} 文字を省略）` : s);

/** 押した・打ったあとの様子（ページが移ったら、その先） */
async function after(entry: Entry, done: string) {
  await settle(entry.wc);
  const { url, title } = infoOf(entry);
  return `${done}。いまのページ: ${title || "(題なし)"} — ${url}`;
}

/** キーを押す（押す・文字・離す） */
function sendKey(wc: WebContents, key: string) {
  const keyCode = browserKeyCode(key);
  wc.sendInputEvent({ type: "keyDown", keyCode });
  if (key.length === 1 || keyCode === "Enter") wc.sendInputEvent({ type: "char", keyCode: keyCode === "Enter" ? "\r" : key });
  wc.sendInputEvent({ type: "keyUp", keyCode });
}

export const agentBrowser: BrowserControl = {
  tabs: () => [...entries.values()].filter((e) => !e.wc.isDestroyed()).map(infoOf),

  async open(projectId, url, reveal) {
    const win = mainWindow();
    if (!win) throw new Error("Kickoff の画面が開いていません");
    const requestId = nextRequest++;
    const reply = new Promise<{ tabKey: string; revealed: boolean } | { error: string }>((resolve) => pendingOpens.set(requestId, resolve));
    const after = reveal ? afterKeyOf(reveal) : undefined;
    // 前に表に出したタブがもう閉じていれば、利用者は見ていないので表に出さない
    const show = reveal !== null && after !== undefined;
    sendEvent(win.webContents, "agentBrowser", "onOpenRequest", requestId, projectId, url, show, after ?? null);
    const result = await withTimeout(reply, 5000, "Kickoff の画面が応答しません").finally(() => pendingOpens.delete(requestId));
    if ("error" in result) throw new Error(result.error);
    const registered = [...entries.values()].find((e) => e.tabKey === result.tabKey);
    const entry =
      registered ??
      (await withTimeout(new Promise<Entry>((resolve) => waiters.set(result.tabKey, resolve)), OPEN_TIMEOUT_MS, "タブを開きましたが、ページの準備が終わりませんでした").finally(() =>
        waiters.delete(result.tabKey),
      ));
    await settle(entry.wc, 0);
    if (result.revealed) await settledLayout(entry.wc);
    return { tab: infoOf(entry), revealed: result.revealed };
  },

  async reveal(tabId, request) {
    const entry = entries.get(tabId);
    const win = mainWindow();
    const after = afterKeyOf(request);
    if (!entry || entry.wc.isDestroyed() || !win || after === undefined) return false;
    const requestId = nextRequest++;
    const reply = new Promise<boolean>((resolve) => pendingReveals.set(requestId, resolve));
    sendEvent(win.webContents, "agentBrowser", "onRevealRequest", requestId, entry.tabKey, after);
    const shown = await withTimeout(reply, REVEAL_TIMEOUT_MS, "Kickoff の画面が応答しません")
      .catch(() => false)
      .finally(() => pendingReveals.delete(requestId));
    if (shown) await settledLayout(entry.wc);
    return shown;
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
    const { wc } = entryOf(tabId);
    if (!(await laidOut(wc))) throw new Error("このタブはいま画面に並んでいないため撮れません（チャット欄・パネルを開くと撮れます）");
    let image = await wc.capturePage();
    if (image.isEmpty()) throw new Error("画面を撮れませんでした（タブが画面に並んでいない可能性があります）");
    if (image.getSize().width > SHOT_MAX_WIDTH) image = image.resize({ width: SHOT_MAX_WIDTH, quality: "good" });
    // 背景を決めていないページは透明に撮れるので、利用者に見えているとおり白の上に置く（JPEG では黒くなる）
    const size = image.getSize();
    image = nativeImage.createFromBitmap(Buffer.from(flattenOnWhite(image.toBitmap())), size);
    return { data: image.toJPEG(80).toString("base64"), mimeType: "image/jpeg" };
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

  consoleLogs: (tabId) => webviewConsoleOf(entryOf(tabId).wc.id),

  touch(tabId) {
    const entry = entries.get(tabId);
    const win = mainWindow();
    if (!entry || !win) return;
    const { tabKey } = entry;
    clearTimeout(activity.get(tabKey));
    sendEvent(win.webContents, "agentBrowser", "onActivity", tabKey, true);
    activity.set(
      tabKey,
      setTimeout(() => {
        activity.delete(tabKey);
        sendEvent(mainWindow()?.webContents, "agentBrowser", "onActivity", tabKey, false);
      }, ACTIVITY_MS),
    );
  },
};

/** 画面のブラウザのタブ（webview）を登録する（頼んできた画面の中の webview に限る） */
function register(e: IpcMainEvent, webContentsId: number, tabKey: string, projectId: number | null) {
  const wc = webContents.fromId(webContentsId);
  if (!isOurWebview(e.sender, wc)) return;
  const known = entries.get(webContentsId);
  if (known) {
    entries.set(webContentsId, { ...known, tabKey, projectId });
    return;
  }
  const entry: Entry = { wc, tabKey, projectId };
  entries.set(webContentsId, entry);
  wc.once("destroyed", () => {
    if (entries.get(webContentsId) === entry) entries.delete(webContentsId);
  });
  waiters.get(tabKey)?.(entry);
}

/** AI のブラウザ操作（IPC の agentBrowser） */
export const agentBrowserHandlers: IpcHandlers["agentBrowser"] = {
  register,
  unregister: (_e, webContentsId) => {
    entries.delete(webContentsId);
  },
  opened: (_e, requestId, tabKey, revealed, error) => pendingOpens.get(requestId)?.(tabKey ? { tabKey, revealed } : { error: error ?? "タブを開けませんでした" }),
  revealed: (_e, requestId, shown) => pendingReveals.get(requestId)?.(shown),
};
