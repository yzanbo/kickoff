import { ipcMain } from "electron";
import { appearanceHandlers } from "@/foundation/desktop/app/appearance";
import { dialogHandlers } from "@/foundation/desktop/app/dialogs";
import { externalAppHandlers } from "@/foundation/desktop/app/externalApps";
import { loginItemHandlers } from "@/foundation/desktop/app/loginItem";
import { popoutHandlers } from "@/foundation/desktop/app/popouts";
import { agentBrowserHandlers } from "@/features/browser/desktop/agentBrowser";
import { browserContextHandlers } from "@/features/browser/desktop/contextMenu";
import { devtoolsHandlers } from "@/features/browser/desktop/devtools";
import { browserExtensionHandlers } from "@/features/browser/desktop/extensions";
import { diagnosticsHandlers } from "@/features/diagnostics/desktop/diagnostics";
import { notificationHandlers } from "@/foundation/desktop/notifications/notifications";
import { terminalHandlers } from "@/foundation/desktop/terminal/terminals";
import { IPC_ARGS } from "./args";
import { fromApp, registerIpcHandlers, type IpcHandlers } from "./register";

/**
 * 画面（preload）から届く IPC をすべて登録する。処理はまとまりごとに、その機能のフォルダにある（取り決めは shared/ipc/contract.ts）。
 * appUrl: Kickoff の画面の URL（ほかの出どころから届いたものは断る）。core: コアのプロセスの帯の操作（index.ts がコアを作ってから渡す）
 */
export function registerIpc(appUrl: string, parts: Pick<IpcHandlers, "core">) {
  registerIpcHandlers(ipcMain, {
    schemas: IPC_ARGS,
    trusted: fromApp(appUrl),
    handlers: {
      dialog: dialogHandlers,
      windows: popoutHandlers(appUrl),
      externalApps: externalAppHandlers,
      browser: browserContextHandlers,
      devtools: devtoolsHandlers,
      agentBrowser: agentBrowserHandlers,
      browserExtensions: browserExtensionHandlers,
      terminal: terminalHandlers,
      notifications: notificationHandlers(),
      loginItem: loginItemHandlers,
      diagnostics: diagnosticsHandlers,
      appearance: appearanceHandlers,
      core: parts.core,
    },
  });
}
