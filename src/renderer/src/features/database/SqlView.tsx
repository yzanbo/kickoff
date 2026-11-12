import type { SQLNamespace } from "@codemirror/lang-sql";
import { Play, PlayCircle, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isReadOnlyStatement, splitStatements, statementAt, type SqlStatement } from "@shared/database/sqlStatements";
import { errorMessage } from "@shared/errors";
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useDragSize } from "@/hooks/useDragSize";
import { cx } from "@/lib/cx";
import type { DbSqlTab } from "@/lib/dbClientTabs";
import { readSetting, writeSetting } from "@/lib/storage";
import { DB_SQL_EDITOR_HEIGHT, dbSqlDraft } from "@/lib/storageKeys";
import { alertDialog } from "@/ui/dialogs";
import { useDbClient } from "./dbClientContext";
import { DbWriteBand } from "./DbWriteBand";
import { SqlEditor, type SqlEditorHandle } from "./SqlEditor";
import { RunResult, type StatementRun } from "./SqlRunResult";
import { useIdleFinish, useSqlResultBudget } from "./useSqlTabLife";
import { SqlHistoryButton } from "./SqlHistory";
import { setSqlPending, useSqlPending } from "./sqlSessions";
import { useSqlWrite } from "./useSqlWrite";

/** 書きかけの SQL を覚えるまでの間（打つたびに書かない） */
const DRAFT_DELAY = 400;

/**
 * SQL のタブ。上に入力欄（⌘↵ でカーソルの文か選んだ範囲、⇧⌘↵ ですべての文）、下に文ごとの結果のタブ。
 * 文は 1 つずつ送り、失敗した文で止める。タブごとに DB の接続を 1 本持ち、トランザクションの途中ならコミット / 取り消すを出す。
 * 読み取り専用の接続は「書き込む」でこのタブだけ外せる（useSqlWrite。外している間は赤い帯）
 */
export function SqlView({ tab, connection, active }: { tab: DbSqlTab; connection: DbConnection; active: boolean }) {
  const client = useDbClient();
  const worktree = client.worktreeOf(connection.id);
  const draftKey = dbSqlDraft(`${client.place}:${tab.key}`);
  const editor = useRef<SqlEditorHandle | null>(null);
  const initial = useMemo(() => readSetting(draftKey), [draftKey]);
  const draftTimer = useRef<number | undefined>(undefined);
  const [runs, setRuns] = useState<StatementRun[]>([]);
  const [shown, setShown] = useState(0);
  const [running, setRunning] = useState(false);
  const stopRequested = useRef(false);
  const pending = useSqlPending(tab.key);
  const [finishing, setFinishing] = useState(false);
  const write = useSqlWrite(connection, pending);
  const height = useDragSize<HTMLDivElement>({ setting: DB_SQL_EDITOR_HEIGHT, axis: "y", unit: "%", min: 15, max: 85 });

  // 補完に使うテーブルと列（接続の既定の DB・スキーマ）
  const outline = useAsync(
    () => api.dbOutline(client.projectId, connection.id, { database: connection.database, schema: null }, worktree),
    [connection.id, worktree],
  );
  const schema = useMemo<SQLNamespace | undefined>(
    () => (outline.data ? Object.fromEntries(outline.data.map((t) => [t.name, t.columns])) : undefined),
    [outline.data],
  );

  // 開いたときに、DB 側の接続がトランザクションの途中かを読み直す（画面を読み込み直しても印を戻す）
  useEffect(() => {
    void api
      .dbSessionState(client.projectId, connection.id, tab.key)
      .then((s) => setSqlPending(tab.key, s.in_transaction))
      .catch(() => {});
  }, [client.projectId, connection.id, tab.key]);

  // 何かした（打つ・流す・続きを読む）。トランザクションの途中で 10 分何もしなければ、コミットか取り消しを聞いて切る
  const markActive = useIdleFinish(pending, connection, tab.key);
  const activity = () => {
    markActive();
    write.touch();
  };

  const saveDraft = (text: string) => {
    activity();
    window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => writeSetting(draftKey, text), DRAFT_DELAY);
  };
  useEffect(() => () => window.clearTimeout(draftTimer.current), []);

  /** 流す文を決める（選んだ範囲があればその中の文、all ならすべて、そうでなければカーソルの文） */
  const pickStatements = (all: boolean): SqlStatement[] => {
    const handle = editor.current;
    if (!handle) return [];
    const text = handle.text();
    const sel = handle.selection();
    if (!sel.empty) return splitStatements(text.slice(sel.from, sel.to), connection.engine);
    const statements = splitStatements(text, connection.engine);
    if (all) return statements;
    const one = statementAt(statements, sel.from);
    return one ? [one] : [];
  };

  const execute = async (all: boolean) => {
    if (running) return;
    const statements = pickStatements(all);
    if (statements.length === 0) return;
    activity();
    if (!(await write.confirmRun(statements))) return;
    // 押したときに書き込む間だったか（流している途中に戻っても、この回は同じ様子で流す）
    const writing = write.on;
    stopRequested.current = false;
    setRunning(true);
    const done: StatementRun[] = [];
    setRuns([]);
    setShown(0);
    for (const s of statements) {
      if (stopRequested.current) break;
      const run: StatementRun = { sql: s.text, write: writing };
      try {
        run.result = await api.runDbSql(client.projectId, connection.id, { session: tab.key, sql: s.text, write: writing }, worktree);
        setSqlPending(tab.key, run.result.in_transaction);
      } catch (e) {
        if (stopRequested.current) run.stopped = true;
        else run.error = errorMessage(e);
      }
      done.push(run);
      setRuns([...done]);
      setShown(done.length - 1);
      // 失敗した文・止めた文で止める（後ろの文は流さず、「流していません」として並べる）
      if (run.error || run.stopped) {
        const rest = statements.slice(statements.indexOf(s) + 1).map((r): StatementRun => ({ sql: r.text, write: writing, skipped: true }));
        if (rest.length > 0) setRuns([...done, ...rest]);
        break;
      }
    }
    // 失敗のあとは、トランザクションの途中かを DB 側に聞き直す
    if (done.some((r) => r.error || r.stopped)) {
      await api
        .dbSessionState(client.projectId, connection.id, tab.key)
        .then((st) => setSqlPending(tab.key, st.in_transaction))
        .catch(() => {});
    }
    setRunning(false);
    activity();
  };

  /** 「さらに読む」: 同じ文を流し直し、読んだ行の数だけ飛ばして続きの DB_SQL_MAX_ROWS 行を足す（読み取りの文だけ） */
  const [loadingMore, setLoadingMore] = useState(false);
  const more = async (index: number) => {
    const run = runs[index];
    if (!run?.result || running || loadingMore) return;
    activity();
    setLoadingMore(true);
    let next: StatementRun;
    try {
      const page = await api.runDbSql(client.projectId, connection.id, { session: tab.key, sql: run.sql, write: run.write, offset: run.result.rows.length }, worktree);
      setSqlPending(tab.key, page.in_transaction);
      next = { ...run, moreError: undefined, result: { ...page, rows: [...run.result.rows, ...page.rows], duration_ms: run.result.duration_ms + page.duration_ms } };
    } catch (e) {
      next = { ...run, moreError: errorMessage(e) };
    }
    setRuns((all) => all.map((r) => (r === run ? next : r)));
    setLoadingMore(false);
  };

  const stop = () => {
    stopRequested.current = true;
    void api.cancelDbSql(client.projectId, connection.id, tab.key).catch(() => {});
  };

  const finish = async (how: "commit" | "rollback") => {
    setFinishing(true);
    try {
      const st = how === "commit" ? await api.commitDbSession(client.projectId, connection.id, tab.key) : await api.rollbackDbSession(client.projectId, connection.id, tab.key);
      // 何かした（10 分を数え直す）に数えない。時間が来てトランザクションの終わりを待っていたら、ここで読み取り専用に戻す
      setSqlPending(tab.key, st.in_transaction);
    } catch (e) {
      await alertDialog(how === "commit" ? "コミットできませんでした" : "取り消せませんでした", errorMessage(e));
    } finally {
      setFinishing(false);
    }
  };

  // 裏のタブの結果が多すぎれば捨て、戻ったら読み取りの文だけ流し直す
  useSqlResultBudget({ tab, connection, worktree, active, busy: running || loadingMore, runs, setRuns });

  const current = runs[shown];

  return (
    <div className={cx("db-sql-view", write.on && "writing")}>
      {write.on && (
        <DbWriteBand
          connection={connection}
          what="流す"
          blocked={pending ? "コミットか取り消しのあとに戻せます" : running ? "流し終わってから戻せます" : null}
          onRevert={write.revert}
        />
      )}
      <div ref={height.paneRef} className="db-sql-top" style={{ height: `${height.size}%` }}>
        <div className="db-sql-toolbar">
          <button type="button" className="btn btn-sm" disabled={running} onClick={() => void execute(false)} data-tip="カーソルの文か、選んだ範囲を流す" data-tip-keys="⌘↵">
            <Play size={13} aria-hidden /> 流す
          </button>
          <button type="button" className="btn btn-sm" disabled={running} onClick={() => void execute(true)} data-tip="すべての文を順に流す（失敗した文で止める）" data-tip-keys="⇧⌘↵">
            <PlayCircle size={13} aria-hidden /> すべて流す
          </button>
          {running && (
            <button type="button" className="btn btn-sm btn-danger" onClick={stop}>
              <Square size={12} aria-hidden /> 止める
            </button>
          )}
          <SqlHistoryButton connection={connection} onPick={(sql) => editor.current?.append(sql)} />
          <span className="db-sql-spacer" />
          <span className={cx("db-sql-env small", `db-env-${connection.environment}`)}>
            <span className="db-env-dot" aria-hidden />
            {DB_ENVIRONMENT_LABELS[connection.environment]}
          </span>
          {connection.read_only && !write.on && (
            <>
              <span className="db-sql-readonly small">読み取り専用</span>
              <button
                type="button"
                className="btn btn-sm"
                disabled={running || pending}
                onClick={() => void write.start()}
                data-tip={pending ? "コミットか取り消しのあとに外せます" : "このタブだけ読み取り専用を外す（環境の名前を入れて確かめます。接続の設定は変えません）"}
              >
                書き込む
              </button>
            </>
          )}
          {pending && (
            <span className="db-sql-pending small">
              コミットしていない変更があります
              <button type="button" className="btn btn-sm btn-primary" disabled={finishing || running} onClick={() => void finish("commit")}>
                コミット
              </button>
              <button type="button" className="btn btn-sm" disabled={finishing || running} onClick={() => void finish("rollback")}>
                取り消す
              </button>
            </span>
          )}
        </div>
        <SqlEditor
          engine={connection.engine}
          initialValue={initial}
          schema={schema}
          onChange={saveDraft}
          onRun={() => void execute(false)}
          onRunAll={() => void execute(true)}
          handleRef={editor}
        />
      </div>
      <div className="pane-resizer db-sql-resizer" {...height.handle} />
      <div className="db-sql-results">
        {runs.length > 1 && (
          <div className="db-result-tabs" role="tablist">
            {runs.map((r, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === shown}
                className={cx("db-result-tab", i === shown && "active", r.error && "failed", r.skipped && "skipped")}
                title={r.sql}
                onClick={() => setShown(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
        {running && runs.length === 0 && <p className="db-sql-note small muted">流しています…</p>}
        {!running && runs.length === 0 && <p className="db-sql-note small muted">結果はここに出ます。</p>}
        {current && (
          <RunResult
            run={current}
            canMore={!running && isReadOnlyStatement(current.sql, connection.engine)}
            loadingMore={loadingMore}
            onMore={() => void more(shown)}
          />
        )}
      </div>
    </div>
  );
}
