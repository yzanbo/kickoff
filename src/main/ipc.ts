import path from "node:path";
import { BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import { closeDevTools, openDevToolsIn, openDevToolsWindow } from "./browserDevtools.js";
import { addExtensionFolder, importFromChrome, installFromWebStore, listExtensions, removeExtension } from "./browserExtensions.js";
import { execFileAsync } from "../core/exec.js";
import { startDiagnostics } from "./diagnostics.js";
import { existingFolder, externalBrowserArgs, externalTerminalArgs, installedBrowsers, installedTerminals, knownBrowser, knownExtension, knownTerminal, webContentsId } from "./ipcArgs.js";
import { registerTerminalIpc } from "./terminals.js";

/** ネイティブのファイル・フォルダの選択（やめたら空） */
async function pickPaths(options: OpenDialogOptions): Promise<string[]> {
  const result = await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

/** 画面（preload）から呼ばれる IPC。mainWindow は性能の記録を取るウィンドウ（通知は notifications.ts） */
export function registerIpc(mainWindow: () => BrowserWindow | undefined) {
  registerTerminalIpc();
  ipcMain.handle("kickoff:pick-folder", async (_e, title?: string) => {
    const [folder] = await pickPaths({ properties: ["openDirectory", "createDirectory"], title: typeof title === "string" ? title : "フォルダを選択" });
    return folder ?? null;
  });
  // 参照資料を選ぶ（フォルダもファイルも、複数まとめて選べる）
  ipcMain.handle("kickoff:pick-references", () =>
    pickPaths({ properties: ["openFile", "openDirectory", "multiSelections"], title: "参照資料にするフォルダ・ファイルを選択", buttonLabel: "追加" }),
  );
  // 性能の記録を取る（設定の「診断」から。メニューの「ヘルプ」と同じ。様子は kickoff:diagnostics で知らせる）
  ipcMain.handle("kickoff:diagnostics-start", (e) => {
    void startDiagnostics(BrowserWindow.fromWebContents(e.sender) ?? mainWindow());
  });
  // 外部のブラウザ（browser: アプリの id）でページを開く（url がなければアプリを開くだけ）。アプリが開けなければ、既定のブラウザで開く
  ipcMain.handle("kickoff:open-in-browser", async (_e, url: unknown, browser?: unknown) => {
    try {
      await execFileAsync("open", externalBrowserArgs(knownBrowser(browser), url));
    } catch (e) {
      if (typeof url === "string" && /^https?:\/\//.test(url)) await shell.openExternal(url);
      else throw e;
    }
  });
  // この Mac に入っている外部のブラウザ（パネルのブラウザの ▾ で選ぶ）
  ipcMain.handle("kickoff:external-browsers", () => installedBrowsers());
  // 埋め込みブラウザの開発者ツール: 同じ画面の別の埋め込みブラウザの中（右・下）・別のウィンドウ・閉じる
  ipcMain.handle("kickoff:browser-devtools-in", (e, targetId: unknown, devtoolsId: unknown) => {
    openDevToolsIn(e.sender, webContentsId(targetId), webContentsId(devtoolsId));
  });
  ipcMain.handle("kickoff:browser-devtools-window", (e, targetId: unknown) => {
    openDevToolsWindow(e.sender, webContentsId(targetId));
  });
  ipcMain.handle("kickoff:browser-devtools-close", (e, targetId: unknown) => {
    if (typeof targetId === "number") closeDevTools(e.sender, targetId);
  });
  // 埋め込みブラウザの拡張機能
  ipcMain.handle("kickoff:browser-extensions", () => listExtensions());
  ipcMain.handle("kickoff:browser-extension-install", (_e, key: unknown) => installFromWebStore(knownExtension(key)));
  ipcMain.handle("kickoff:browser-extension-import", (_e, key: unknown) => importFromChrome(knownExtension(key)));
  ipcMain.handle("kickoff:browser-extension-add-folder", async () => {
    const [dir] = await pickPaths({ properties: ["openDirectory"], title: "展開済みの拡張機能のフォルダを選択" });
    return dir ? addExtensionFolder(dir) : listExtensions();
  });
  ipcMain.handle("kickoff:browser-extension-remove", (_e, extPath: string) => removeExtension(String(extPath)));
  ipcMain.handle("kickoff:open-path", async (_e, target: string) => {
    if (typeof target === "string" && path.isAbsolute(target)) await shell.openPath(target);
  });
  // 外部のターミナル（選んだアプリ。既定は Terminal.app）で、そのフォルダを開く（アプリの中のターミナルとは別の窓）
  ipcMain.handle("kickoff:open-external-terminal", async (_e, dir: unknown, terminal?: unknown) => {
    await execFileAsync("open", externalTerminalArgs(knownTerminal(terminal), existingFolder(dir)));
  });
  // この Mac に入っている外部のターミナル（設定で選ぶ）
  ipcMain.handle("kickoff:external-terminals", () => installedTerminals());
  // VS Code でファイルを開く（line があればその行へ）。VS Code がなければ失敗を返す
  ipcMain.handle("kickoff:open-in-vscode", async (_e, target: string, line?: number) => {
    if (typeof target !== "string" || !path.isAbsolute(target)) throw new Error("ファイルの場所が正しくありません");
    const position = typeof line === "number" && line > 0 ? `:${Math.floor(line)}` : "";
    await shell.openExternal(`vscode://file${encodeURI(target)}${position}`);
  });
}
