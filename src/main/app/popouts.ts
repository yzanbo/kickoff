import { BrowserWindow, type Rectangle } from "electron";
import type { IpcHandlers } from "../ipc/register.js";
import { PRELOAD_FILE } from "./environment.js";
import { openLinksExternally } from "./externalLinks.js";
import { showMainWindow } from "./window.js";

// 別ウィンドウ（チャットの画面の右の欄の変更・ファイル・サブエージェントを、メインのウィンドウの外に出して見る。2 枚目の画面に置くなど）

/** 画面を読み込む前に見える地の色（メインのウィンドウと同じ） */
const BACKGROUND = "#181b1a";

/** 開いている別ウィンドウ（画面の route ごとに 1 つ。同じものを開こうとしたら前に出す） */
const popouts = new Map<string, BrowserWindow>();
/** 最後に閉じた（動かした）別ウィンドウの位置と大きさ（次に開くとき、少しずらして同じ大きさで開く。アプリを閉じるまで覚える） */
let lastBounds: Rectangle | undefined;

/** IPC の windows（画面から頼まれて開く）。appUrl は Kickoff の画面の URL（同じ画面を、route のハッシュで開く） */
export function popoutHandlers(appUrl: string): IpcHandlers["windows"] {
  return {
    openPopout: (_e, route, title) => openPopout(appUrl, route, title),
    focusMain: () => showMainWindow(),
  };
}

function openPopout(appUrl: string, route: string, title: string) {
  const existing = popouts.get(route);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return;
  }
  const at = lastBounds ? { x: lastBounds.x + 24, y: lastBounds.y + 24, width: lastBounds.width, height: lastBounds.height } : { width: 920, height: 820 };
  const win = new BrowserWindow({
    ...at,
    minWidth: 420,
    minHeight: 320,
    title,
    backgroundColor: BACKGROUND,
    webPreferences: {
      preload: PRELOAD_FILE,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // ウィンドウの名前は開いたときのもの（画面の <title> で書き換えない）
  win.on("page-title-updated", (e) => e.preventDefault());
  // 外部リンクは既定のブラウザで開く（メインのウィンドウと同じ）
  openLinksExternally(win.webContents);
  const url = new URL(appUrl);
  url.hash = route;
  void win.loadURL(url.toString());
  const remember = () => {
    if (!win.isDestroyed()) lastBounds = win.getBounds();
  };
  win.on("moved", remember);
  win.on("resized", remember);
  win.on("close", remember);
  win.on("closed", () => {
    if (popouts.get(route) === win) popouts.delete(route);
  });
  popouts.set(route, win);
}
