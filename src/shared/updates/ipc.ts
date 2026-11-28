// 更新の IPC の取り決め（window.kickoff の updates。処理は src/features/updates/desktop/）。
// 表の部品は @shared/foundation/ipc。全部を並べるのは src/app/shared/ipc.ts
import { event, invoke, type IpcTable } from "@shared/foundation/ipc";
import type { UpdatesSnapshot } from "./types";

export const UPDATES_IPC = {
  updates: {
    /** 版の情報（番号・ビルド番号・短い SHA・作り方）と、更新の様子 */
    snapshot: invoke<[], UpdatesSnapshot>(),
    /** いま新しい版を確かめる（結果は onState で届く。「確認中…」は少なくとも 0.5 秒出す） */
    check: invoke<[]>(),
    /** ［更新して開き直す］（作業中のチャットがあれば、終わってから開き直す） */
    install: invoke<[]>(),
    /** 作業が終わるのを待っているのをやめる */
    cancelInstall: invoke<[]>(),
    /** ［この版は飛ばす］の印を消す（飛ばした版は画面がアプリの設定 skipped_update_version に書く） */
    skip: invoke<[]>(),
    /** 更新の様子が変わった */
    onState: event<[snapshot: UpdatesSnapshot]>(),
    /** メニューの「アップデートを確認…」を押した（メインのウィンドウが設定の「Kickoff について」を開く） */
    onOpenRequested: event<[]>(),
  },
} satisfies IpcTable;

type UpdatesIpc = typeof UPDATES_IPC;
declare module "@shared/foundation/ipc/contract" {
  interface IpcTableMap extends UpdatesIpc {}
}
