import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import { APP_ENVS } from "../core/appEnv.js";
import { seedDevData } from "../core/devData.js";
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
  closeDevTools,
  openDevToolsIn,
  openDevToolsWindow,
  openInChrome,
  removeExtension,
} from "./browser.js";
import { stopChildElectronApps } from "./childApps.js";
import { killAllTerminals, registerTerminalIpc } from "./terminals.js";

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

function registerIpc() {
  registerTerminalIpc();
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
  // 埋め込みブラウザの開発者ツールを、同じ画面の別の埋め込みブラウザの中に表示する（右・下に並べる）
  ipcMain.handle("kickoff:browser-devtools-in", (e, targetId: unknown, devtoolsId: unknown) => {
    if (typeof targetId !== "number" || typeof devtoolsId !== "number") throw new Error("開発者ツールの指定が正しくありません");
    openDevToolsIn(e.sender, targetId, devtoolsId);
  });
  // 埋め込みブラウザの開発者ツールを、別のウィンドウで開く
  ipcMain.handle("kickoff:browser-devtools-window", (e, targetId: unknown) => {
    if (typeof targetId !== "number") throw new Error("開発者ツールの指定が正しくありません");
    openDevToolsWindow(e.sender, targetId);
  });
  ipcMain.handle("kickoff:browser-devtools-close", (e, targetId: unknown) => {
    if (typeof targetId === "number") closeDevTools(e.sender, targetId);
  });
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
  // VS Code でファイルを開く（line があればその行へ）。VS Code がなければ失敗を返す
  ipcMain.handle("kickoff:open-in-vscode", async (_e, target: string, line?: number) => {
    if (typeof target !== "string" || !path.isAbsolute(target)) throw new Error("ファイルの場所が正しくありません");
    const position = typeof line === "number" && line > 0 ? `:${Math.floor(line)}` : "";
    await shell.openExternal(`vscode://file${encodeURI(target)}${position}`);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let closing = false;
app.on("before-quit", (e) => {
  if (!core) return killAllTerminals();
  // 実行中のエージェントや DB を閉じてから終了する（片付けの間に届いた終了の指示も待たせる）
  e.preventDefault();
  if (closing) return;
  closing = true;
  const coreToClose = core;
  // 片付けのあとに app.quit() を呼び直すと、ウィンドウを閉じたところで終了が取り消されてしまうので、app.exit で終える。
  // 片付けが終わらなくても、5 秒で終える
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000));
  const cleanup = async () => {
    // 内蔵ターミナル・エージェントから起動した Electron のアプリ（開発版の Kickoff Dev など）を、先に正しく止める（3 秒まで）。
    // シェルやエージェントを先に止めると、そのアプリが Helper ごといきなり止められ、localStorage が消えることがある
    await stopChildElectronApps(3000);
    killAllTerminals();
    await coreToClose.close();
  };
  void Promise.race([cleanup(), timeout])
    .catch((err) => console.error("[main] 終了の片付けに失敗しました", err))
    .finally(() => app.exit(0));
});
