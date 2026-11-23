// SQL のタブの流し方: 文を 1 つずつ送る・さらに読む・止める・コミット / 取り消す・使っていない間の扱い
import { useEffect, useRef, useState } from "react";
import type { SqlStatement } from "@shared/database/sqlStatements";
import { errorMessage } from "@shared/foundation/errors";
import type { DbConnection } from "@shared/database/types";
import { dbApi, dbAt, dbSession } from "@/features/database/ui/api";
import { alert } from "@/foundation/ui/kit/ask";
import type { DbSqlTab } from "@/features/database/ui/state/dbClientTabs";
import { useDbClient } from "@/features/database/ui/state/dbClientContext";
import { setSqlPending } from "@/features/database/ui/state/sqlSessions";
import type { useSqlWrite } from "@/features/database/ui/write/useSqlWrite";
import type { StatementRun } from "./SqlRunResult";
import { skipRest } from "./skipRest";
import { useIdleFinish, useSqlResultBudget } from "./useSqlTabLife";

/**
 * 文は 1 つずつ送り、失敗・止めた文で止める（残りは流していませんで並べ、失敗のあとはトランザクションの途中かを聞き直す）。
 * 何かした（打つ・流す・続きを読む）は activity で知らせる（10 分の時計を数え直す）
 */
export function useSqlRun({ tab, connection, worktree, active, pending, write }: { tab: DbSqlTab; connection: DbConnection; worktree: string | null; active: boolean; pending: boolean; write: ReturnType<typeof useSqlWrite> }) {
  const client = useDbClient();
  const [runs, setRuns] = useState<StatementRun[]>([]);
  const [shown, setShown] = useState(0);
  const [running, setRunning] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const stopRequested = useRef(false);
  const at = dbAt(client.projectId, connection.id, worktree);
  const session = dbSession(client.projectId, connection.id, tab.key);
  const readPending = () =>
    dbApi("GET /api/projects/:projectId/db-connections/:connectionId/sessions/:session", session)
      .then((s) => setSqlPending(tab.key, s.in_transaction))
      .catch(() => {});

  // 開いたときに、DB 側の接続がトランザクションの途中かを読み直す（画面を読み込み直しても印を戻す）
  useEffect(() => {
    void dbApi("GET /api/projects/:projectId/db-connections/:connectionId/sessions/:session", dbSession(client.projectId, connection.id, tab.key))
      .then((s) => setSqlPending(tab.key, s.in_transaction))
      .catch(() => {});
  }, [client.projectId, connection.id, tab.key]);

  // トランザクションの途中で 10 分何もしなければ、コミットか取り消しを聞いて切る
  const markActive = useIdleFinish(pending, connection, tab.key);
  const activity = () => {
    markActive();
    write.touch();
  };

  const execute = async (statements: SqlStatement[]) => {
    if (running || statements.length === 0) return;
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
        run.result = await dbApi("POST /api/projects/:projectId/db-connections/:connectionId/sql", { ...at, body: { session: tab.key, sql: s.text, write: writing } });
        setSqlPending(tab.key, run.result.in_transaction);
      } catch (e) {
        if (stopRequested.current) run.stopped = true;
        else run.error = errorMessage(e);
      }
      done.push(run);
      setRuns(skipRest(statements, done, writing));
      setShown(done.length - 1);
      if (run.error || run.stopped) break;
    }
    if (done.some((r) => r.error || r.stopped)) await readPending();
    setRunning(false);
    activity();
  };

  /** 「さらに読む」: 同じ文を流し直し、読んだ行の数だけ飛ばして続きの DB_SQL_MAX_ROWS 行を足す（読み取りの文だけ） */
  const more = async (index: number) => {
    const run = runs[index];
    if (!run?.result || running || loadingMore) return;
    activity();
    setLoadingMore(true);
    let next: StatementRun;
    try {
      const page = await dbApi("POST /api/projects/:projectId/db-connections/:connectionId/sql", { ...at, body: { session: tab.key, sql: run.sql, write: run.write, offset: run.result.rows.length } });
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
    void dbApi("POST /api/projects/:projectId/db-connections/:connectionId/sessions/:session/cancel", session).catch(() => {});
  };

  const finish = async (how: "commit" | "rollback") => {
    setFinishing(true);
    const request = how === "commit" ? dbApi("POST /api/projects/:projectId/db-connections/:connectionId/sessions/:session/commit", session) : dbApi("POST /api/projects/:projectId/db-connections/:connectionId/sessions/:session/rollback", session);
    await request.then(
      // 何かした（10 分を数え直す）に数えない。時間が来てトランザクションの終わりを待っていたら、ここで読み取り専用に戻す
      (st) => setSqlPending(tab.key, st.in_transaction),
      (e: unknown) => alert(how === "commit" ? "コミットできませんでした" : "取り消せませんでした", errorMessage(e)),
    );
    setFinishing(false);
  };

  // 裏のタブの結果が多すぎれば捨て、戻ったら読み取りの文だけ流し直す
  useSqlResultBudget({ tab, connection, worktree, active, busy: running || loadingMore, runs, setRuns });

  return { runs, shown, setShown, running, loadingMore, finishing, activity, execute, more, stop, finish };
}
