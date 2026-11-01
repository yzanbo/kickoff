/** 状態の色: 使える・使えない・確認中・対応予定 */
export type StatusTone = "ok" | "ng" | "pending" | "na";

/** ok: true = 使える / false = 使えない / null = 対応予定 / undefined = 確認中 */
export function toneOf(ok: boolean | null | undefined): StatusTone {
  return ok === undefined ? "pending" : ok === null ? "na" : ok ? "ok" : "ng";
}

/** 状態の点（接続・ログイン・準備状況） */
export function StatusDot({ tone }: { tone: StatusTone }) {
  return <span className={`status-dot tone-${tone}`} />;
}
