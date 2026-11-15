// 性能の記録（アプリのメニュー「ヘルプ → 性能の記録を取る」・設定の「診断」。メインプロセスの main/diagnostics/diagnostics.ts が取る）

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

/** 性能の記録の保存先（設定の「診断」に出す。root はまとめて入れるフォルダ、records は記録ごとのフォルダ（新しい順）） */
export interface DiagnosticsFolders {
  root: string;
  records: string[];
}

/** 起動の記録の画面の段階（メモの仕様書「0023_表示を軽くする」の案 18c。画面の app/bootMarks.ts が付ける） */
export const BOOT_MARKS = ["entry", "storageReady", "appImported", "firstCommit", "firstPaint", "firstContentfulPaint", "interactive"] as const;
export type BootMarkName = (typeof BOOT_MARKS)[number];

/** 画面の窓の種類（メインのウィンドウ / 別ウィンドウ） */
export const BOOT_WINDOWS = ["main", "popout"] as const;
export type BootWindow = (typeof BOOT_WINDOWS)[number];

/** 画面の起動の時刻（diagnostics.reportBoot。1 回の読み込みで 1 回だけ送る） */
export interface BootReport {
  window: BootWindow;
  /** 画面のプロセスが読み込みを始めた時刻（performance.timeOrigin。epoch ms） */
  timeOrigin: number;
  /** 段階ごとの時刻（epoch ms。interactive が 10 秒でそろわなければ null。ほかは取れなければない） */
  marks: Partial<Record<BootMarkName, number | null>>;
  /** 読み込んだ画面の JS・CSS（/assets/ の下）: 数・キャッシュから出ずに取り直した数・合計の大きさ（KB） */
  assets: { count: number; refetched: number; encodedKB: number } | null;
}

/** 画面のメモリ（diagnostics.reportMemory。60 秒ごと） */
export interface RendererMemory {
  window: BootWindow;
  /** JavaScript のメモリ（MB。取れなければ null） */
  jsHeapMB: number | null;
  /** 画面の要素の数 */
  domNodes: number;
}
