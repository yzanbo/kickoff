import path from "node:path";
import { app, dialog, ipcMain, shell, type BrowserWindow, type OpenDialogOptions } from "electron";
import { openInChrome } from "./browser.js";
import { closeDevTools, openDevToolsIn, openDevToolsWindow } from "./browserDevtools.js";
import { addExtensionFolder, importFromChrome, installFromWebStore, listExtensions, removeExtension } from "./browserExtensions.js";
import { execFileAsync } from "../core/exec.js";
import { existingFolder, knownExtension, webContentsId } from "./ipcArgs.js";
import { registerTerminalIpc } from "./terminals.js";

/** ネイティブのファイル・フォルダの選択（やめたら空） */
async function pickPaths(options: OpenDialogOptions): Promise<string[]> {
  const result = await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

/** 画面（preload）から呼ばれる IPC。mainWindow は通知を押したときに前面に出すウィンドウ */
export function registerIpc(mainWindow: () => BrowserWindow | undefined) {
  registerTerminalIpc();
  // 通知を押したとき: Kickoff を前面に出す
  ipcMain.handle("kickoff:focus-window", () => {
    const win = mainWindow();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    app.focus({ steal: true });
  });
  ipcMain.handle("kickoff:pick-folder", async (_e, title?: string) => {
    const [folder] = await pickPaths({ properties: ["openDirectory", "createDirectory"], title: typeof title === "string" ? title : "フォルダを選択" });
    return folder ?? null;
  });
  // 参照資料を選ぶ（フォルダもファイルも、複数まとめて選べる）
  ipcMain.handle("kickoff:pick-references", () =>
    pickPaths({ properties: ["openFile", "openDirectory", "multiSelections"], title: "参照資料にするフォルダ・ファイルを選択", buttonLabel: "追加" }),
  );
  ipcMain.handle("kickoff:open-in-chrome", (_e, url: string) => openInChrome(String(url)));
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
  // macOS のターミナル（Terminal.app）で、そのフォルダを開く（アプリの中のターミナルとは別の窓）
  ipcMain.handle("kickoff:open-external-terminal", async (_e, dir: unknown) => {
    await execFileAsync("open", ["-a", "Terminal", existingFolder(dir)]);
  });
  // VS Code でファイルを開く（line があればその行へ）。VS Code がなければ失敗を返す
  ipcMain.handle("kickoff:open-in-vscode", async (_e, target: string, line?: number) => {
    if (typeof target !== "string" || !path.isAbsolute(target)) throw new Error("ファイルの場所が正しくありません");
    const position = typeof line === "number" && line > 0 ? `:${Math.floor(line)}` : "";
    await shell.openExternal(`vscode://file${encodeURI(target)}${position}`);
  });
}
