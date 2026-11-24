import { app, BrowserWindow, type BrowserWindowConstructorOptions } from "electron";
import { followAppearance, windowBackground } from "./appearance";
import { PRELOAD_FILE } from "./environment";
import { openLinksExternally } from "./externalLinks";
import { watchWindowLoad } from "./startupLog";
import { watchRendererHang } from "./hangWatch";
import { markMain } from "@/foundation/desktop/app/bootRecorder";

// メインのウィンドウ（Kickoff の画面）。Mac ではウィンドウを閉じてもアプリは残り、Dock を押すと作り直す

let current: BrowserWindow | undefined;
/** 画面の URL（窓がないときに作り直すため。index.ts が準備のあとに渡す） */
let mainUrl: string | undefined;

/** 画面の URL を覚える（窓を出さずに起動したとき・窓を閉じたあとに、通知・2 つ目の起動から窓を作るため） */
export function setMainWindowUrl(url: string) {
  mainUrl = url;
}

/**
 * Kickoff の画面の窓を作る（メインのウィンドウと別ウィンドウで同じ: preload・砂場・地の色をテーマに合わせる・外部リンクは既定のブラウザ・
 * 応答しなくなったら止まった場所を書き、戻らなければ読み込み直すかを聞く）。webview: 埋め込みブラウザを置くか。label: 応答しないときの文の窓の名前
 */
export function createAppWindow(options: BrowserWindowConstructorOptions & { webview: boolean }, label: string): BrowserWindow {
  const { webview, ...rest } = options;
  const win = new BrowserWindow({
    ...rest,
    // 画面を読み込む前・大きさを変えている間に見える地の色。選んでいるテーマの --bg と同じにする（app/appearance.ts）
    backgroundColor: windowBackground(),
    // 埋め込みブラウザのページの安全設定は、browser の hardenWebviews がすべての webview に効かせる
    webPreferences: { preload: PRELOAD_FILE, contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: webview },
  });
  followAppearance(win);
  openLinksExternally(win.webContents);
  watchRendererHang(win, label);
  return win;
}

/** いまのメインのウィンドウ（閉じていれば undefined） */
export const mainWindow = (): BrowserWindow | undefined => current;

/**
 * メインのウィンドウを作り、画面（url）を読み込む。before を渡せば、窓だけ先に作って（画面のプロセスの準備をコアの起動と重ねる）、
 * それが済んでから読み込む（起動のとき: コアの ready と画面のセッションの Cookie。失敗したら読み込まない = アプリは終わる）
 */
export function openMainWindow(url: string, before?: Promise<unknown>) {
  const win = createAppWindow(
    {
      width: 1360,
      height: 880,
      // 窓を並べるアプリで 4 分割にしても収まる小ささ。幅 720px 以下は縦 1 列の画面（スマホ向け。styles/layout.css の @media）になるので、
      // その 1 つ上で止める。高さは、チャットの送信欄が欠けずに収まるところ
      minWidth: 721,
      minHeight: 480,
      title: app.getName(),
      titleBarStyle: "hiddenInset",
      // 信号機ボタンの位置を固定し、画面側の開閉ボタンと高さをそろえる（画面の .titlebar-toggle と対応）
      trafficLightPosition: { x: 14, y: 14 },
      // 開発中のアプリのプレビュー・ドキュメント閲覧用の埋め込みブラウザ
      webview: true,
    },
    "メインのウィンドウ",
  );
  // 起動の時刻（diagnostics/bootRecorder.ts。最初の 1 回だけ覚える）
  markMain("windowCreated");
  win.webContents.on("did-start-loading", () => markMain("loadStart"));
  win.webContents.on("dom-ready", () => markMain("domReady"));
  win.webContents.on("did-finish-load", () => markMain("loaded"));
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
