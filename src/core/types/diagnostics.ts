// 性能の記録（アプリのメニュー「ヘルプ → 性能の記録を取る」・設定の「診断」。メインプロセスの main/diagnostics.ts が取る）

/** 記録の様子（メインプロセスから画面へ知らせる。画面の隅の印に出す） */
export type DiagnosticsState =
  | { state: "recording"; endsAt: number }
  | { state: "saving" }
  | { state: "done"; dir: string; summary: DiagnosticsDigest }
  | { state: "error"; message: string };

/** 記録の要点（画面の印に出す。全体は保存したフォルダの summary.json） */
export interface DiagnosticsDigest {
  /** 画面の要素の数 */
  domNodes: number;
  /** JavaScript のメモリ（MB） */
  heapMB: number;
  /** 1 秒あたりの JavaScript の実行とレイアウトの時間（ミリ秒） */
  scriptMsPerSec: number;
  layoutMsPerSec: number;
}
