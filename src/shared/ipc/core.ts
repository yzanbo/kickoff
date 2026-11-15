// Kickoff のコア（別のプロセス）の様子（メインプロセスが見張り、画面の上の帯に出す。メモの仕様書「0023_表示を軽くする」の案 16・U8・U9）

/** starting = 起動中 / ready = 動いている / restarting = 落ちたので作り直している / failed = 作り直すのを止めた / unresponsive = 30 秒応答しない */
export const CORE_STATES = ["starting", "ready", "restarting", "failed", "unresponsive"] as const;
export type CoreState = (typeof CORE_STATES)[number];

export interface CoreStatus {
  state: CoreState;
}
