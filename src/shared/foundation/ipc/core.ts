// Kickoff のコア（別のプロセス）の様子（メインプロセスが見張り、画面の上の帯に出す）

/** starting = 起動中 / ready = 動いている / restarting = 落ちたので作り直している / failed = 作り直すのを止めた / unresponsive = 30 秒応答しない */
const CORE_STATES = ["starting", "ready", "restarting", "failed", "unresponsive"] as const;
export type CoreState = (typeof CORE_STATES)[number];

/** 帯の文（ready・starting は帯を出さない） */
export const CORE_STATE_LABELS: Record<CoreState, string | null> = {
  starting: null,
  ready: null,
  restarting: "Kickoff のコアを起動し直しています…",
  failed: "コアが止まりました",
  unresponsive: "Kickoff のコアが応答しません",
};

/** 作り直している間・止まっている間に送れなかったときの文（入力欄の文は残す） */
export const CORE_DOWN_SEND_MESSAGE = "コアを起動し直しています。戻ったらもう一度送ってください";

export interface CoreStatus {
  state: CoreState;
}
