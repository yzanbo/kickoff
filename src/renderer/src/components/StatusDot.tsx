/** 状態の色: 使える・使えない・確認中・対応予定 */
export type StatusTone = "ok" | "ng" | "pending" | "na";

/** ok: true = 使える / false = 使えない / null = 対応予定 / undefined = 確認中 */
export function toneOf(ok: boolean | null | undefined): StatusTone {
  return ok === undefined ? "pending" : ok === null ? "na" : ok ? "ok" : "ng";
}

/**
 * 状態の点。tone は接続・ログイン・準備状況（使える・使えない・確認中・対応予定）、
 * color はカンバンの列・チャットの状態のように、色を呼び出し側で決めるとき（tones.ts の COLUMN_TONE / STATE_TONE）
 */
export function StatusDot(props: { tone: StatusTone } | { color: string }) {
  return "tone" in props ? <span className={`status-dot tone-${props.tone}`} /> : <span className="status-dot" style={{ background: props.color }} />;
}
