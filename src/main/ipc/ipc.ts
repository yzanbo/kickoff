import { ipcMain, type BrowserWindow } from "electron";
import { dialogHandlers } from "../app/dialogs.js";
import { externalAppHandlers } from "../app/externalApps.js";
import { devtoolsHandlers } from "../browser/devtools.js";
import { browserExtensionHandlers } from "../browser/extensions.js";
import { diagnosticsHandlers } from "../diagnostics/diagnostics.js";
import { notificationHandlers } from "../notifications/notifications.js";
import { terminalHandlers } from "../terminal/terminals.js";
import { IPC_ARGS } from "./args.js";
import { fromApp, registerIpcHandlers } from "./register.js";

/**
 * 画面（preload）から届く IPC をすべて登録する。処理はまとまりごとに、その機能のフォルダにある（取り決めは shared/ipc/contract.ts）。
 * appUrl: Kickoff の画面の URL（ほかの出どころから届いたものは断る）。mainWindow: 通知を押したとき・性能の記録で使うウィンドウ
 */
export function registerIpc({ appUrl, mainWindow }: { appUrl: string; mainWindow: () => BrowserWindow | undefined }) {
  registerIpcHandlers(ipcMain, {
    schemas: IPC_ARGS,
    trusted: fromApp(appUrl),
    handlers: {
      dialog: dialogHandlers,
      externalApps: externalAppHandlers,
      devtools: devtoolsHandlers,
      browserExtensions: browserExtensionHandlers,
      terminal: terminalHandlers,
      notifications: notificationHandlers(mainWindow),
      diagnostics: diagnosticsHandlers(mainWindow),
    },
  });
}
