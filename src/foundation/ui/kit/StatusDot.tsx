/** 状態の色: 使える・使えない・確認中・対応予定 */
export type StatusTone = "ok" | "ng" | "pending" | "na";

/** ok: true = 使える / false = 使えない / null = 対応予定 / undefined = 確認中 */
export function toneOf(ok: boolean | null | undefined): StatusTone {
  return ok === undefined ? "pending" : ok === null ? "na" : ok ? "ok" : "ng";
}

/**
 * 状態の点。tone は接続・ログイン・準備状況（使える・使えない・確認中・対応予定）、
 * state はカンバンの列・チャットの状態の色の名前（data-state。色は CSS の [data-state] が決める --state-color。@shared/chat/stateLooks の tone）
 */
export function StatusDot(props: { tone: StatusTone } | { state: string }) {
  return "tone" in props ? <span className={`status-dot tone-${props.tone}`} /> : <span className="status-dot" data-state={props.state} />;
}
