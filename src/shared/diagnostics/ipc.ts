// 診断の IPC の取り決め（window.kickoff の diagnostics。処理は src/features/diagnostics/desktop/）。
// 表の部品と中身の型は @shared/foundation/ipc。全部を並べるのは src/app/shared/ipc.ts
import { event, invoke, send, type BootReport, type DiagnosticsFolders, type DiagnosticsOverview, type DiagnosticsState, type IpcTable, type RendererMemory } from "@shared/foundation/ipc";

export const DIAGNOSTICS_IPC = {
  /** 性能の記録（重いときに、その場で 10 秒の記録を取って保存する。メニューの「ヘルプ」からも始まる） */
  diagnostics: {
    start: invoke<[]>(),
    /** 保存先と最近の記録のフォルダ（新しい順） */
    folders: invoke<[], DiagnosticsFolders>(),
    /** 保存先を Finder で開く（まだなければ作る） */
    openRoot: invoke<[]>(),
    /** いつも取っている記録のまとめ（最近 24 時間の詰まり・最後の起動の時刻。設定の「診断」に出す） */
    overview: invoke<[], DiagnosticsOverview>(),
    /** ログの場所（~/Library/Logs/<アプリ名>）を Finder で開く（まだなければ作る） */
    openLogs: invoke<[]>(),
    /** 記録の様子（記録中・保存中・保存した・失敗） */
    onState: event<[state: DiagnosticsState]>(),
    /** 画面の起動の時刻（読み込みごとに 1 回。メインが startup.log・boot.jsonl に書く） */
    reportBoot: send<[report: BootReport]>(),
    /** 画面のメモリ（60 秒ごと。メインが metrics.jsonl に書く） */
    reportMemory: send<[memory: RendererMemory]>(),
  },
} satisfies IpcTable;

type DiagnosticsIpc = typeof DIAGNOSTICS_IPC;
declare module "@shared/foundation/ipc/contract" {
  interface IpcTableMap extends DiagnosticsIpc {}
}
