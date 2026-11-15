import { app, BrowserWindow } from "electron";
import { followAppearance, windowBackground } from "./appearance.js";
import { PRELOAD_FILE } from "./environment.js";
import { openLinksExternally } from "./externalLinks.js";
import { watchWindowLoad } from "./startupLog.js";
import { watchRendererHang } from "./hangWatch.js";
import { markMain } from "../diagnostics/bootRecorder.js";

// メインのウィンドウ（Kickoff の画面）。Mac ではウィンドウを閉じてもアプリは残り、Dock を押すと作り直す

let current: BrowserWindow | undefined;
/** 画面の URL（窓がないときに作り直すため。index.ts が準備のあとに渡す） */
let mainUrl: string | undefined;

/** 画面の URL を覚える（窓を出さずに起動したとき・窓を閉じたあとに、通知・2 つ目の起動から窓を作るため） */
export function setMainWindowUrl(url: string) {
  mainUrl = url;
}

/** いまのメインのウィンドウ（閉じていれば undefined） */
export const mainWindow = (): BrowserWindow | undefined => current;

/**
 * メインのウィンドウを作り、画面（url）を読み込む。before を渡せば、窓だけ先に作って（画面のプロセスの準備をコアの起動と重ねる）、
 * それが済んでから読み込む（起動のとき: コアの ready と画面のセッションの Cookie。失敗したら読み込まない = アプリは終わる）
 */
export function openMainWindow(url: string, before?: Promise<unknown>) {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    title: app.getName(),
    titleBarStyle: "hiddenInset",
    // 信号機ボタンの位置を固定し、画面側の開閉ボタンと高さをそろえる（画面の .titlebar-toggle と対応）
    trafficLightPosition: { x: 14, y: 14 },
    // 画面を読み込む前・大きさを変えている間に見える地の色。選んでいるテーマの --bg と同じにする（app/appearance.ts）
    backgroundColor: windowBackground(),
    webPreferences: {
      preload: PRELOAD_FILE,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // 開発中のアプリのプレビュー・ドキュメント閲覧用の埋め込みブラウザ
      webviewTag: true,
    },
  });
  followAppearance(win);
  // 起動の時刻（diagnostics/bootRecorder.ts。最初の 1 回だけ覚える）
  markMain("windowCreated");
  win.webContents.on("did-start-loading", () => markMain("loadStart"));
  win.webContents.on("dom-ready", () => markMain("domReady"));
  win.webContents.on("did-finish-load", () => markMain("loaded"));
  // 外部リンク（PR の URL など）は既定のブラウザで開く
  openLinksExternally(win.webContents);
  // 応答しなくなったら、止まった場所を書き、戻らなければ画面を読み込み直すかを聞く
  watchRendererHang(win, "メインのウィンドウ");
  const load = () => {
    if (win.isDestroyed()) return;
    watchWindowLoad(win.webContents, url);
    void win.loadURL(url);
  };
  if (before) before.then(load, () => {});
  else load();
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
