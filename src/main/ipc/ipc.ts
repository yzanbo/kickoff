import { ipcMain } from "electron";
import { dialogHandlers } from "../app/dialogs.js";
import { externalAppHandlers } from "../app/externalApps.js";
import { popoutHandlers } from "../app/popouts.js";
import { devtoolsHandlers } from "../browser/devtools.js";
import { browserExtensionHandlers } from "../browser/extensions.js";
import { diagnosticsHandlers } from "../diagnostics/diagnostics.js";
import { notificationHandlers } from "../notifications/notifications.js";
import { terminalHandlers } from "../terminal/terminals.js";
import { IPC_ARGS } from "./args.js";
import { fromApp, registerIpcHandlers } from "./register.js";

/**
 * 画面（preload）から届く IPC をすべて登録する。処理はまとまりごとに、その機能のフォルダにある（取り決めは shared/ipc/contract.ts）。
 * appUrl: Kickoff の画面の URL（ほかの出どころから届いたものは断る）
 */
export function registerIpc(appUrl: string) {
  registerIpcHandlers(ipcMain, {
    schemas: IPC_ARGS,
    trusted: fromApp(appUrl),
    handlers: {
      dialog: dialogHandlers,
      windows: popoutHandlers(appUrl),
      externalApps: externalAppHandlers,
      devtools: devtoolsHandlers,
      browserExtensions: browserExtensionHandlers,
      terminal: terminalHandlers,
      notifications: notificationHandlers(),
      diagnostics: diagnosticsHandlers,
    },
  });
}
