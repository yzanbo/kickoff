import { BrowserWindow, WebContentsView, webContents, type WebContents } from "electron";
import type { DevtoolsBounds } from "@shared/foundation/ipc";
import { sendEvent, type IpcHandlers } from "@/foundation/desktop/ipc/register";
import { browserSession } from "./browser";
import { viewBoundsOf } from "./devtoolsBounds";

// 埋め込みブラウザ（<webview>）の開発者ツール。どこに出しているかは画面の側で持つ（Electron の知らせは遅れて届く）

/** 頼んできた画面の中の埋め込みブラウザか */
export const isOurWebview = (host: WebContents, c: WebContents | undefined): c is WebContents => Boolean(c && c.getType() === "webview" && c.hostWebContents === host);

// 開発者ツールを出す WebContents は、どれも埋め込みブラウザのセッションで作る。開発者ツールは、出す先のセッションにある拡張機能のパネル
// （React DevTools など）を読み込むため（既定のセッションだと拡張機能のページが ERR_BLOCKED_BY_CLIENT で断られる）
const DEVTOOLS_BACKGROUND = "#202124";

// 埋め込みブラウザ（の WebContents の ID）ごとの、開発者ツールの別のウィンドウ
const devtoolsWindows = new Map<number, BrowserWindow>();

/**
 * 右・下に並べた開発者ツール: 画面のウィンドウに重ねた表示（WebContentsView）。埋め込みブラウザ（の WebContents の ID）ごと。
 * <webview> の中には出さない（Electron 45 では、<webview> に出した開発者ツールが Electron とつながらず、ページを調べられず拡張機能も出ない）。
 * 重ねた表示は画面の HTML より上に描かれるので、置き場所と出す・隠すは画面が決めて place で知らせる
 */
interface DockedDevtools {
  view: WebContentsView;
  win: BrowserWindow;
  host: WebContents;
}
const dockedViews = new Map<number, DockedDevtools>();
type Point = { x: number; y: number };

/** 別のウィンドウを閉じる（こちらから閉じるときは、画面には知らせない） */
function closeDevToolsWindow(targetId: number) {
  const win = devtoolsWindows.get(targetId);
  devtoolsWindows.delete(targetId);
  if (win && !win.isDestroyed()) win.destroy();
}

/** 右・下に並べた表示を外して捨てる */
function closeDockedView(targetId: number) {
  const docked = dockedViews.get(targetId);
  dockedViews.delete(targetId);
  if (!docked) return;
  if (!docked.win.isDestroyed()) docked.win.contentView.removeChildView(docked.view);
  if (!docked.view.webContents.isDestroyed()) docked.view.webContents.close();
}

function targetOf(host: WebContents, targetId: number): WebContents {
  const target = webContents.fromId(targetId);
  if (!isOurWebview(host, target)) throw new Error("開発者ツールを開けません");
  return target;
}

/** いま出している開発者ツール（別のウィンドウ・右・下）を閉じる */
function resetDevTools(target: WebContents) {
  closeDevToolsWindow(target.id);
  closeDockedView(target.id);
  if (target.isDevToolsOpened()) target.closeDevTools();
}

/** 右・下に並べる: 画面のウィンドウに重ねた表示を作って bounds に置き、その中に開発者ツールを出す */
function openDevToolsIn(host: WebContents, targetId: number, bounds: DevtoolsBounds, inspect?: Point) {
  const target = targetOf(host, targetId);
  const win = BrowserWindow.fromWebContents(host);
  if (!win) throw new Error("開発者ツールを開けません");
  resetDevTools(target);
  const view = new WebContentsView({ webPreferences: { session: browserSession() } });
  view.setBackgroundColor(DEVTOOLS_BACKGROUND);
  view.setBounds(viewBoundsOf(bounds, host.getZoomFactor()));
  win.contentView.addChildView(view);
  dockedViews.set(targetId, { view, win, host });
  // ページ・画面・ウィンドウのどれかがなくなったら片付ける
  const cleanup = () => {
    if (dockedViews.get(targetId)?.view === view) closeDockedView(targetId);
  };
  target.once("destroyed", cleanup);
  host.once("destroyed", cleanup);
  win.once("closed", cleanup);
  target.setDevToolsWebContents(view.webContents);
  target.openDevTools();
  if (inspect) target.inspectElement(inspect.x, inspect.y);
}

/** 右・下に並べた開発者ツールの置き場所を変える（null は隠す） */
function placeDevTools(host: WebContents, targetId: number, bounds: DevtoolsBounds | null) {
  const docked = dockedViews.get(targetId);
  if (!docked || docked.host !== host) return;
  if (!bounds) return docked.view.setVisible(false);
  docked.view.setBounds(viewBoundsOf(bounds, host.getZoomFactor()));
  docked.view.setVisible(true);
}

/** 右・下に並べた開発者ツールの見た目を撮る（画面が隠している間に代わりに見せる） */
async function snapshotDevTools(host: WebContents, targetId: number): Promise<string | null> {
  const docked = dockedViews.get(targetId);
  if (!docked || docked.host !== host || docked.view.webContents.isDestroyed()) return null;
  const image = await docked.view.webContents.capturePage().catch(() => null);
  if (!image || image.isEmpty()) return null;
  return `data:image/jpeg;base64,${image.toJPEG(85).toString("base64")}`;
}

/**
 * 埋め込みブラウザの開発者ツールを、別のウィンドウで開く。一度ほかの WebContents に表示すると Electron の既定の別ウィンドウは開かなくなるので、
 * 開発者ツール用のウィンドウをこちらで作り、その中に表示する（Electron の説明どおりのやり方）。
 * 利用者がウィンドウを閉じたら、開発者ツールも閉じて画面に知らせる（devtools.onWindowClosed）
 */
function openDevToolsWindow(host: WebContents, targetId: number, inspect?: Point) {
  const target = targetOf(host, targetId);
  resetDevTools(target);
  const win = new BrowserWindow({ width: 1000, height: 720, title: "開発者ツール", backgroundColor: DEVTOOLS_BACKGROUND, webPreferences: { session: browserSession() } });
  devtoolsWindows.set(targetId, win);
  target.setDevToolsWebContents(win.webContents);
  target.openDevTools({ mode: "detach" });
  if (inspect) target.inspectElement(inspect.x, inspect.y);
  win.on("closed", () => {
    // こちらから閉じたとき（場所を変えた・閉じるボタン）は何もしない
    if (devtoolsWindows.get(targetId) !== win) return;
    devtoolsWindows.delete(targetId);
    if (!target.isDestroyed() && target.isDevToolsOpened()) target.closeDevTools();
    sendEvent(host, "devtools", "onWindowClosed", targetId);
  });
}

/** 開発者ツールを閉じる（別のウィンドウ・右・下も） */
function closeDevTools(host: WebContents, targetId: number) {
  const target = webContents.fromId(targetId);
  if (!target) {
    closeDevToolsWindow(targetId);
    closeDockedView(targetId);
    return;
  }
  if (isOurWebview(host, target)) resetDevTools(target);
}

/** 埋め込みブラウザの開発者ツール（IPC の devtools）。どれも、頼んできた画面の中の埋め込みブラウザに限る */
export const devtoolsHandlers: IpcHandlers["devtools"] = {
  openIn: (e, targetId, bounds, inspect) => openDevToolsIn(e.sender, targetId, bounds, inspect),
  place: (e, targetId, bounds) => placeDevTools(e.sender, targetId, bounds),
  snapshot: (e, targetId) => snapshotDevTools(e.sender, targetId),
  openWindow: (e, targetId, inspect) => openDevToolsWindow(e.sender, targetId, inspect),
  close: (e, targetId) => closeDevTools(e.sender, targetId),
};
