import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import { AUTH_COOKIE } from "../core/auth.js";
import { startCore, type Core } from "../core/index.js";
import { loadLoginShellPath } from "../core/shellEnv.js";

// ビルド後の out/main を基準にする
const outDir = path.join(import.meta.dirname, "..");
const port = Number(process.env.KICKOFF_PORT ?? 4317);
// 開発時は electron-vite の dev サーバー、本番時はコアが画面も配信する
const devUrl = process.env.ELECTRON_RENDERER_URL;

// データの保存先をヘッドレス起動（daemon）と揃える
app.setName("Kickoff");
app.setPath("userData", path.join(app.getPath("appData"), "Kickoff"));

let core: Core | undefined;
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
    backgroundColor: "#0f1115",
    webPreferences: {
      preload: path.join(outDir, "preload", "index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
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
  ipcMain.handle("kickoff:pick-folder", async (_e, title?: string) => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: typeof title === "string" ? title : "フォルダを選択",
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
  ipcMain.handle("kickoff:open-path", async (_e, target: string) => {
    if (typeof target === "string" && path.isAbsolute(target)) await shell.openPath(target);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let closing = false;
app.on("before-quit", (e) => {
  if (!core || closing) return;
  // 実行中のエージェントや DB を閉じてから終了する
  e.preventDefault();
  closing = true;
  void core.close().finally(() => app.quit());
});
