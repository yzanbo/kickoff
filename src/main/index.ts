import path from "node:path";
import { app, BrowserWindow, dialog, session, shell } from "electron";
import { APP_ENVS } from "../core/appEnv.js";
import { seedDevData } from "../core/devData.js";
import { AUTH_COOKIE } from "../core/auth.js";
import { errorMessage } from "../core/errors.js";
import { startCore, type Core } from "../core/index.js";
import { loadLoginShellPath } from "../core/shellEnv.js";
import { hardenWebviews } from "./browser.js";
import { loadSavedExtensions } from "./browserExtensions.js";
import { setAppMenu } from "./appMenu.js";
import { registerIpc } from "./ipc.js";
import { registerNotifications } from "./notifications.js";
import { allowAppMicrophone } from "./mediaPermission.js";
import { registerShutdown } from "./shutdown.js";

// ビルド後の out/main を基準にする
const outDir = path.join(import.meta.dirname, "..");
// 本番（インストールしたアプリ）と開発（npm run dev）で、名前・保存先・ポートを分ける（同時に動かせるように。appEnv.ts）
const env = APP_ENVS[app.isPackaged ? "production" : "development"];
const port = Number(process.env.KICKOFF_PORT ?? env.port);
// 開発時は electron-vite の dev サーバー、本番時はコアが画面も配信する
const devUrl = process.env.ELECTRON_RENDERER_URL;

// データの保存先は、同じ環境のヘッドレス起動（daemon）とそろえる
app.setName(env.name);
app.setPath("userData", path.join(app.getPath("appData"), env.name));
// 開発のデータがまだなければ、本番のデータから一度だけ写す（起動中の印を作る前に）
if (!app.isPackaged) seedDevData(path.join(app.getPath("appData"), APP_ENVS.production.name), app.getPath("userData"));

let core: Core | undefined;

// 開発時の動作確認用: KICKOFF_REMOTE_DEBUG=<port> のときだけ、外部から画面を操作できるようにする
if (process.env.KICKOFF_REMOTE_DEBUG && !app.isPackaged) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.KICKOFF_REMOTE_DEBUG);
}

// 埋め込みブラウザの安全設定は、ウィンドウを作る前に登録しておく
hardenWebviews();
let mainWindow: BrowserWindow | undefined;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    loadLoginShellPath();
    try {
      core = await startCore({
        dataDir: app.getPath("userData"),
        port,
        staticDir: devUrl ? undefined : path.join(outDir, "renderer"),
      });
    } catch (e) {
      dialog.showErrorBox("Kickoff を起動できません", `コアの起動に失敗しました（ポート ${port}）。\n${errorMessage(e)}`);
      app.quit();
      return;
    }

    const uiUrl = devUrl ?? core.localUrl;
    // 画面から API を呼ぶための認証 Cookie を設定（トークンを画面のコードに渡さない）
    await session.defaultSession.cookies.set({
      url: uiUrl,
      name: AUTH_COOKIE,
      value: core.token,
      httpOnly: true,
      sameSite: "strict",
      expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    });

    // チャット欄の音声入力: Kickoff の画面からのマイクだけ許す（埋め込みブラウザは別のセッションなので広げない）
    allowAppMicrophone(session.defaultSession, uiUrl);
    registerIpc(() => mainWindow);
    registerNotifications(() => mainWindow);
    setAppMenu(() => mainWindow);
    createWindow(uiUrl);
    // 埋め込みブラウザの拡張機能（React DevTools など）を読み込む
    void loadSavedExtensions().then((errors) => errors.forEach((e) => console.warn("[browser] 拡張機能を読み込めません:", e)));

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(uiUrl);
    });
  });
}

function createWindow(url: string) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    title: env.name,
    titleBarStyle: "hiddenInset",
    // 信号機ボタンの位置を固定し、画面側の開閉ボタンと高さをそろえる（styles.css の .titlebar-toggle と対応）
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: "#0f1115",
    webPreferences: {
      preload: path.join(outDir, "preload", "index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // 開発中のアプリのプレビュー・ドキュメント閲覧用の埋め込みブラウザ
      webviewTag: true,
    },
  });
  // 外部リンク（PR の URL など）は既定のブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//.test(target)) void shell.openExternal(target);
    return { action: "deny" };
  });
  void mainWindow.loadURL(url);
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// 終了時の片付け（shutdown.ts。before-quit の流れは変えない）
registerShutdown(() => core);
