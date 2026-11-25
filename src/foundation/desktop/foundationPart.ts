// 土台のメインの部品（ダイアログ・別ウィンドウ・外のアプリ・ターミナル・通知・ログイン時に起動・見た目の IPC と、土台のまとまりの引数の形）・
// コアの帯の部品（IPC の core）と、合わせた部品の IPC を登録する口（並べるのは src/app/desktop/index.ts）
import { ipcMain } from "electron";
import type { IpcTable } from "@shared/foundation/ipc";
import { appearanceHandlers } from "@/foundation/desktop/app/appearance";
import { coreIpcHandlers } from "@/foundation/desktop/app/coreHost";
import type { CoreProcess } from "@/foundation/desktop/app/coreProcess";
import { dialogHandlers } from "@/foundation/desktop/app/dialogs";
import { externalAppHandlers } from "@/foundation/desktop/app/externalApps";
import { loginItemHandlers } from "@/foundation/desktop/app/loginItem";
import { popoutHandlers } from "@/foundation/desktop/app/popouts";
import { foundationArgs } from "@/foundation/desktop/ipc/args";
import { fromApp, registerIpcHandlers, type IpcHandlers } from "@/foundation/desktop/ipc/register";
import { notificationHandlers } from "@/foundation/desktop/app/notifications";
import { defineDesktopPart, type MergedParts } from "@/foundation/desktop/parts";
import { terminalHandlers } from "@/foundation/desktop/terminal/terminals";

/** 土台の部品（appUrl: Kickoff の画面の URL。別ウィンドウはそこから開く） */
export const foundationDesktop = (appUrl: string, setStateBadges: IpcHandlers["notifications"]["setStateBadges"]) =>
  defineDesktopPart({
    name: "foundation",
    ipc: {
      dialog: dialogHandlers,
      windows: popoutHandlers(appUrl),
      externalApps: externalAppHandlers,
      terminal: terminalHandlers,
      notifications: notificationHandlers(setStateBadges),
      loginItem: loginItemHandlers,
      appearance: appearanceHandlers,
    },
    argSchemas: foundationArgs,
  });

/** コアの帯の部品（画面の上の帯の操作。コアのプロセスを作ってから並べる） */
export const coreDesktop = (core: CoreProcess) => defineDesktopPart({ name: "core", ipc: { core: coreIpcHandlers(core) } });

/**
 * 画面（preload）から届く IPC をすべて登録する（table は全部のまとまりを並べた表）。
 * appUrl と同じ出どころの Kickoff の画面からだけ受ける。部品の並べ忘れ（処理・引数の形のないもの）は登録で投げる
 */
export function registerIpc(appUrl: string, table: IpcTable, parts: MergedParts) {
  registerIpcHandlers(ipcMain, { table, schemas: parts.argSchemas, handlers: parts.ipc, trusted: fromApp(appUrl) });
}
