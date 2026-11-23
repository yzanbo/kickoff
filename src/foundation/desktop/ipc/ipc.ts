import { ipcMain } from "electron";
import { appearanceHandlers } from "@/foundation/desktop/app/appearance";
import { dialogHandlers } from "@/foundation/desktop/app/dialogs";
import { externalAppHandlers } from "@/foundation/desktop/app/externalApps";
import { loginItemHandlers } from "@/foundation/desktop/app/loginItem";
import { popoutHandlers } from "@/foundation/desktop/app/popouts";
import { notificationHandlers } from "@/foundation/desktop/notifications/notifications";
import { terminalHandlers } from "@/foundation/desktop/terminal/terminals";
import { IPC_ARGS } from "./args";
import { fromApp, registerIpcHandlers, type IpcHandlers } from "./register";

/** 土台が処理を持つまとまり（ほかのまとまり = コアの帯・機能の部品の分は、組み立て src/app/desktop/index.ts が渡す） */
type FoundationIpcGroup = "dialog" | "windows" | "externalApps" | "terminal" | "notifications" | "loginItem" | "appearance";

/**
 * 画面（preload）から届く IPC をすべて登録する。処理はまとまりごとに、その機能のフォルダにある（取り決めは shared/ipc/contract.ts）。
 * appUrl: Kickoff の画面の URL（ほかの出どころから届いたものは断る）。parts: コアのプロセスの帯の操作（index.ts がコアを作ってから渡す）と機能の部品の処理
 */
export function registerIpc(appUrl: string, parts: Omit<IpcHandlers, FoundationIpcGroup>) {
  registerIpcHandlers(ipcMain, {
    schemas: IPC_ARGS,
    trusted: fromApp(appUrl),
    handlers: {
      dialog: dialogHandlers,
      windows: popoutHandlers(appUrl),
      externalApps: externalAppHandlers,
      terminal: terminalHandlers,
      notifications: notificationHandlers(),
      loginItem: loginItemHandlers,
      appearance: appearanceHandlers,
      ...parts,
    },
  });
}
