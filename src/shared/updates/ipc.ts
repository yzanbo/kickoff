// 更新の IPC の取り決め（window.kickoff の updates。処理は src/features/updates/desktop/）。
// 表の部品は @shared/foundation/ipc。全部を並べるのは src/app/shared/ipc.ts
import { invoke, type IpcTable } from "@shared/foundation/ipc";
import type { BuildInfo } from "./types";

export const UPDATES_IPC = {
  updates: {
    /** この版の番号・ビルド番号・短い SHA・作り方 */
    build: invoke<[], BuildInfo>(),
  },
} satisfies IpcTable;

type UpdatesIpc = typeof UPDATES_IPC;
declare module "@shared/foundation/ipc/contract" {
  interface IpcTableMap extends UpdatesIpc {}
}
