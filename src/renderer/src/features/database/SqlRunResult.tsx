// SQL のタブの文ごとの結果（表・変えた行の数・失敗・止めた・続きがあれば「さらに読む」）
import { DB_SQL_MAX_ROWS, type DbQueryResult } from "@shared/types";
import { ErrorText } from "@/ui/ErrorText";
import { DataGrid } from "./DataGrid";

/** 1 つの文を流した結果（失敗したら error。止めたら stopped） */
export interface StatementRun {
  sql: string;
  /** 流したときに書き込む間だったか（「さらに読む」も同じ様子で流す） */
  write: boolean;
  result?: DbQueryResult;
  error?: string;
  stopped?: boolean;
  /** 「さらに読む」の失敗 */
  moreError?: string;
  /** 裏のタブの結果が多すぎて捨てた（読み取りの文は戻ったら流し直す） */
  evicted?: boolean;
  /** 前の文が失敗した・止めたので流していない */
  skipped?: boolean;
}

export function RunResult({ run, canMore, loadingMore, onMore }: { run: StatementRun; canMore: boolean; loadingMore: boolean; onMore: () => void }) {
  if (run.stopped) return <p className="db-sql-note small muted">止めました。</p>;
  if (run.skipped) {
    return (
      <div className="db-sql-error">
        <p className="db-sql-note small muted">前の文で止まったので、流していません。</p>
        <pre className="db-sql-failed-statement">{run.sql}</pre>
      </div>
    );
  }
  if (run.evicted) return <p className="db-sql-note small muted">ほかのタブの結果と合わせて多くなったので、この結果は捨てました。読み取りの文は、このタブに戻ると流し直します（書く文は流し直しません）。</p>;
  if (run.error) {
    return (
      <div className="db-sql-error">
        <ErrorText message={run.error} />
        <pre className="db-sql-failed-statement">{run.sql}</pre>
      </div>
    );
  }
  const r = run.result!;
  const hasRows = r.columns.length > 0;
  return (
    <div className="db-sql-result">
      {hasRows ? (
        <DataGrid columns={r.columns} rows={r.rows} />
      ) : (
        <p className="db-sql-note small">{r.affected != null ? `${r.affected.toLocaleString()} 行を変えました。` : "流しました。"}</p>
      )}
      <div className="db-table-foot small muted">
        {hasRows && <span>{r.rows.length.toLocaleString()} 行</span>}
        {r.truncated && <span className="db-sql-truncated">続きがあります</span>}
        {r.truncated && canMore && (
          <button type="button" className="btn btn-sm" disabled={loadingMore} onClick={onMore}>
            {loadingMore ? "読み込み中…" : `さらに ${DB_SQL_MAX_ROWS.toLocaleString()} 行読む`}
          </button>
        )}
        <ErrorText message={run.moreError} />
        <span>{(Math.round(r.duration_ms * 10) / 10).toLocaleString()} ms</span>
      </div>
    </div>
  );
}
