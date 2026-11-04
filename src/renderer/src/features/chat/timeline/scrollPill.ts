// 一番下へ戻るボタンに出すいまの状態の決め方（純粋関数。useScrollPill が使う）

export type ScrollPillTone = "waiting" | "arrived" | "working" | "idle" | "failed" | "offline";

/**
 * 一番下へ戻るボタンに出す状態（上から先に決める）: 答えを待っている（目立たせて下へ誘う）→ 通信が切れて、つながるのを待っている（黄）→
 * 上を読んでいる間に作業が終わった（返答が届いた・失敗した。目立たせる）→ 作業中（いまの段階 = 作業中の行と同じ文。通信の再試行中は黄）→ 終わっている（結果）
 */
export function scrollPillOf<W>({
  waiting,
  reconnecting,
  finishedWhileAway,
  busy,
  retrying,
  failed,
  working,
  statusLabel,
}: {
  waiting: boolean;
  /** 作業は止まり、つながったら自動で再開するのを待っている */
  reconnecting: boolean;
  finishedWhileAway: boolean;
  busy: boolean;
  /** 通信が切れて、再試行している */
  retrying: boolean;
  /** 最後の作業が失敗したか */
  failed: boolean;
  /** 作業中の行の文 */
  working: W;
  /** チャットの状態の名前（終わっているとき） */
  statusLabel: string;
}): { label: string | W; tone: ScrollPillTone } {
  if (waiting) return { label: "回答を待っています", tone: "waiting" };
  if (!busy && reconnecting) return { label: "通信待ち（つながったら自動で再開）", tone: "offline" };
  if (finishedWhileAway) return { label: failed ? "失敗しました" : "返答が届きました", tone: failed ? "failed" : "arrived" };
  if (busy) return { label: working, tone: retrying ? "offline" : "working" };
  return { label: statusLabel, tone: failed ? "failed" : "idle" };
}
