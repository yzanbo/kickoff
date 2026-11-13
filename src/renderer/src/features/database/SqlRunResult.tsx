// SQL のタブの文ごとの結果（表・変えた行の数・失敗・止めた・続きがあれば「さらに読む」）
import { DB_SQL_MAX_ROWS, type DbQueryResult } from "@shared/types";
import { ErrorText } from "@/ui/ErrorText";
import { DataGrid } from "./DataGrid";
import { durationLabel } from "./dbFormat";
import { runOutcome } from "./sqlResultLabels";
import { RowsExport } from "./RowsExport";

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

export function RunResult({
  run,
  env,
  canMore,
  loadingMore,
  onMore,
}: {
  run: StatementRun;
  /** 下の帯の環境の一文（sqlResultLabels.ts の envSentence） */
  env: string;
  canMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
}) {
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
        <span>{durationLabel(r.duration_ms)}</span>
        <span className="db-sql-env-note">{env}</span>
        {hasRows && r.rows.length > 0 && <ResultExport result={r} />}
      </div>
    </div>
  );
}

/**
 * 結果の下の帯の「書き出す」と「コピー」。読み込んだ行だけで、長い値は頭だけ
 * （SQL の結果は行を指すキーが分からないので、テーブルのタブのように残りを読み直せない）
 */
function ResultExport({ result }: { result: DbQueryResult }) {
  return (
    <span className="db-sql-result-tools">
      <RowsExport fileName="sql-result" count={result.rows.length} columns={result.columns} rows={async () => result.rows} />
    </span>
  );
}

/** 結果の「メッセージ」のタブ: 流した文ごとの結果を 1 行ずつ（番号・文の頭・結果と時間。失敗は失敗の文も）。押すとその文の結果のタブ */
export function RunMessages({ runs, onPick }: { runs: StatementRun[]; onPick: (index: number) => void }) {
  return (
    <ol className="db-sql-messages small">
      {runs.map((r, i) => (
        <li key={i} className={r.error ? "failed" : r.skipped ? "skipped" : undefined}>
          <button type="button" className="link-button" onClick={() => onPick(i)}>
            結果 {i + 1}
          </button>
          <code className="db-sql-message-sql">{r.sql.replace(/\s+/g, " ").slice(0, 120)}</code>
          <span className="muted">{runOutcome(r)}</span>
          {r.error && <span className="db-sql-message-error">{r.error}</span>}
        </li>
      ))}
    </ol>
  );
}
