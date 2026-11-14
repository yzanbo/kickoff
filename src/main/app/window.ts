import { app, BrowserWindow } from "electron";
import { PRELOAD_FILE } from "./environment.js";
import { openLinksExternally } from "./externalLinks.js";
import { watchWindowLoad } from "./startupLog.js";
import { watchRendererHang } from "./hangWatch.js";

// メインのウィンドウ（Kickoff の画面）。Mac ではウィンドウを閉じてもアプリは残り、Dock を押すと作り直す

/**
 * 画面を読み込む前・大きさを変えている間に見える地の色。画面の --bg（styles/base/tokens.css の既定のダーク）と同じにする
 * （以前は #0f1115 で、読み込む間だけ画面と違う色が見えていた）
 */
const BACKGROUND = "#141818";

let current: BrowserWindow | undefined;
/** 画面の URL（窓がないときに作り直すため。index.ts が準備のあとに渡す） */
let mainUrl: string | undefined;

/** 画面の URL を覚える（窓を出さずに起動したとき・窓を閉じたあとに、通知・2 つ目の起動から窓を作るため） */
export function setMainWindowUrl(url: string) {
  mainUrl = url;
}

/** いまのメインのウィンドウ（閉じていれば undefined） */
export const mainWindow = (): BrowserWindow | undefined => current;

/** メインのウィンドウを作り、画面（url）を読み込む */
export function openMainWindow(url: string) {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    title: app.getName(),
    titleBarStyle: "hiddenInset",
    // 信号機ボタンの位置を固定し、画面側の開閉ボタンと高さをそろえる（画面の .titlebar-toggle と対応）
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: BACKGROUND,
    webPreferences: {
      preload: PRELOAD_FILE,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // 開発中のアプリのプレビュー・ドキュメント閲覧用の埋め込みブラウザ
      webviewTag: true,
    },
  });
  // 外部リンク（PR の URL など）は既定のブラウザで開く
  openLinksExternally(win.webContents);
  watchWindowLoad(win.webContents, url);
  // 応答しなくなったら、止まった場所を書き、戻らなければ画面を読み込み直すかを聞く
  watchRendererHang(win, "メインのウィンドウ");
  void win.loadURL(url);
  win.on("closed", () => {
    if (current === win) current = undefined;
  });
  current = win;
}

/** メインのウィンドウを前に出す（2 つ目を起動しようとしたとき・通知を押したとき） */
export function showMainWindow(hash = ""): boolean {
  // 窓がなければ（閉じた・ログイン時に窓を出さずに起動した）、その画面（hash）で作る。作ったときは false（中身の画面はまだ読み込んでいない）
  if (!current) {
    if (mainUrl) openMainWindow(mainUrl + hash);
    return false;
  }
  if (current.isMinimized()) current.restore();
  current.show();
  app.focus({ steal: true });
  return true;
}
