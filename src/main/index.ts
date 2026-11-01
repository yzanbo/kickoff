import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import { AUTH_COOKIE } from "../core/auth.js";
import { startCore, type Core } from "../core/index.js";
import { loadLoginShellPath } from "../core/shellEnv.js";
import {
  KNOWN_EXTENSIONS,
  addExtensionFolder,
  hardenWebviews,
  importFromChrome,
  installFromWebStore,
  listExtensions,
  loadSavedExtensions,
  openInChrome,
  removeExtension,
} from "./browser.js";

// ビルド後の out/main を基準にする
const outDir = path.join(import.meta.dirname, "..");
const port = Number(process.env.KICKOFF_PORT ?? 4317);
// 開発時は electron-vite の dev サーバー、本番時はコアが画面も配信する
const devUrl = process.env.ELECTRON_RENDERER_URL;

// データの保存先をヘッドレス起動（daemon）と揃える
app.setName("Kickoff");
app.setPath("userData", path.join(app.getPath("appData"), "Kickoff"));

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
      dialog.showErrorBox("Kickoff を起動できません", `コアの起動に失敗しました（ポート ${port}）。\n${String(e)}`);
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

    registerIpc();
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
    title: "Kickoff",
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

function registerIpc() {
  // 通知を押したとき: Kickoff を前面に出す
  ipcMain.handle("kickoff:focus-window", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    app.focus({ steal: true });
  });
  ipcMain.handle("kickoff:pick-folder", async (_e, title?: string) => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: typeof title === "string" ? title : "フォルダを選択",
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  // 参照資料を選ぶ（フォルダもファイルも、複数まとめて選べる）
  ipcMain.handle("kickoff:pick-references", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "openDirectory", "multiSelections"],
      title: "参照資料にするフォルダ・ファイルを選択",
      buttonLabel: "追加",
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle("kickoff:open-in-chrome", (_e, url: string) => openInChrome(String(url)));
  ipcMain.handle("kickoff:browser-extensions", () => listExtensions());
  ipcMain.handle("kickoff:browser-extension-install", (_e, key: string) => {
    if (!(key in KNOWN_EXTENSIONS)) throw new Error("未対応の拡張機能です");
    return installFromWebStore(key as keyof typeof KNOWN_EXTENSIONS);
  });
  ipcMain.handle("kickoff:browser-extension-import", (_e, key: string) => {
    if (!(key in KNOWN_EXTENSIONS)) throw new Error("未対応の拡張機能です");
    return importFromChrome(key as keyof typeof KNOWN_EXTENSIONS);
  });
  ipcMain.handle("kickoff:browser-extension-add-folder", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "展開済みの拡張機能のフォルダを選択" });
    return result.canceled || !result.filePaths[0] ? listExtensions() : addExtensionFolder(result.filePaths[0]);
  });
  ipcMain.handle("kickoff:browser-extension-remove", (_e, extPath: string) => removeExtension(String(extPath)));
  ipcMain.handle("kickoff:open-path", async (_e, target: string) => {
    if (typeof target === "string" && path.isAbsolute(target)) await shell.openPath(target);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let closing = false;
app.on("before-quit", (e) => {
  if (!core) return;
  // 実行中のエージェントや DB を閉じてから終了する（片付けの間に届いた終了の指示も待たせる）
  e.preventDefault();
  if (closing) return;
  closing = true;
  // 片付けのあとに app.quit() を呼び直すと、ウィンドウを閉じたところで終了が取り消されてしまうので、app.exit で終える。
  // 片付けが終わらなくても、5 秒で終える
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
  void Promise.race([core.close(), timeout])
    .catch((err) => console.error("[main] 終了の片付けに失敗しました", err))
    .finally(() => app.exit(0));
});
