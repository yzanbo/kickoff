import { BrowserWindow, webContents, type WebContents } from "electron";
import { sendEvent, type IpcHandlers } from "../ipc/register.js";

// 埋め込みブラウザ（<webview>）の開発者ツール。どこに出しているかは画面の側で持つ（Electron の知らせは遅れて届く）

/**
 * 埋め込みブラウザの開発者ツールを、同じ画面の別の埋め込みブラウザ（devtoolsId）の中に表示する（右・下に並べるため）。
 * どちらも、頼んできた画面の中の埋め込みブラウザであることを確かめる
 */
export const isOurWebview = (host: WebContents, c: WebContents | undefined): c is WebContents => Boolean(c && c.getType() === "webview" && c.hostWebContents === host);

// 埋め込みブラウザ（の WebContents の ID）ごとの、開発者ツールの別のウィンドウ
const devtoolsWindows = new Map<number, BrowserWindow>();

/** 別のウィンドウを閉じる（こちらから閉じるときは、画面には知らせない） */
function closeDevToolsWindow(targetId: number) {
  const win = devtoolsWindows.get(targetId);
  devtoolsWindows.delete(targetId);
  if (win && !win.isDestroyed()) win.destroy();
}

function targetOf(host: WebContents, targetId: number): WebContents {
  const target = webContents.fromId(targetId);
  if (!isOurWebview(host, target)) throw new Error("開発者ツールを開けません");
  return target;
}

/** いま出している開発者ツール（別のウィンドウ・タブの中）を閉じる */
function resetDevTools(target: WebContents) {
  closeDevToolsWindow(target.id);
  if (target.isDevToolsOpened()) target.closeDevTools();
}

function openDevToolsIn(host: WebContents, targetId: number, devtoolsId: number) {
  const target = targetOf(host, targetId);
  const devtools = webContents.fromId(devtoolsId);
  if (!isOurWebview(host, devtools)) throw new Error("開発者ツールを開けません");
  resetDevTools(target);
  target.setDevToolsWebContents(devtools);
  target.openDevTools();
}

/**
 * 埋め込みブラウザの開発者ツールを、別のウィンドウで開く。一度タブの中に表示すると Electron の既定の別ウィンドウは開かなくなるので、
 * 開発者ツール用のウィンドウをこちらで作り、その中に表示する（Electron の説明どおりのやり方）。
 * 利用者がウィンドウを閉じたら、開発者ツールも閉じて画面に知らせる（devtools.onWindowClosed）
 */
function openDevToolsWindow(host: WebContents, targetId: number) {
  const target = targetOf(host, targetId);
  resetDevTools(target);
  const win = new BrowserWindow({ width: 1000, height: 720, title: "開発者ツール", backgroundColor: "#202124" });
  devtoolsWindows.set(targetId, win);
  target.setDevToolsWebContents(win.webContents);
  target.openDevTools({ mode: "detach" });
  win.on("closed", () => {
    // こちらから閉じたとき（場所を変えた・閉じるボタン）は何もしない
    if (devtoolsWindows.get(targetId) !== win) return;
    devtoolsWindows.delete(targetId);
    if (!target.isDestroyed() && target.isDevToolsOpened()) target.closeDevTools();
    sendEvent(host, "devtools", "onWindowClosed", targetId);
  });
}

/** 開発者ツールを閉じる（別のウィンドウも） */
function closeDevTools(host: WebContents, targetId: number) {
  const target = webContents.fromId(targetId);
  if (!target) return closeDevToolsWindow(targetId);
  if (isOurWebview(host, target)) resetDevTools(target);
}

/** 埋め込みブラウザの開発者ツール（IPC の devtools）。どちらも、頼んできた画面の中の埋め込みブラウザに限る */
export const devtoolsHandlers: IpcHandlers["devtools"] = {
  openIn: (e, targetId, devtoolsId) => openDevToolsIn(e.sender, targetId, devtoolsId),
  openWindow: (e, targetId) => openDevToolsWindow(e.sender, targetId),
  close: (e, targetId) => closeDevTools(e.sender, targetId),
};
