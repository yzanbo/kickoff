// SQL のタブの、使っていない間の扱い: トランザクションの途中で 10 分何もしなければ聞いて切る（useIdleFinish）・
// 裏のタブの結果が多すぎれば捨て、戻ったら読み取りの文だけ流し直す（useSqlResultBudget）
import { useEffect, useMemo, useRef } from "react";
import { isReadOnlyStatement } from "@shared/database/sqlStatements";
import { errorMessage } from "@shared/errors";
import { DB_SESSION_IDLE_MS, type DbConnection } from "@shared/types";
import { api } from "@/api";
import type { DbSqlTab } from "@/lib/dbClientTabs";
import { useDbClient } from "./dbClientContext";
import { estimateRowsBytes, useResultBudget } from "./resultBudget";
import type { StatementRun } from "./SqlRunResult";
import { finishSession } from "./sqlSessions";

/**
 * トランザクションの途中（pending）で DB_SESSION_IDLE_MS 何もしなければ、「10 分何もしていないので、接続を切ります」と
 * コミット / 取り消すを聞いて切る（やめたら、また 10 分後に聞く）。何かしたら返す関数を呼ぶ
 */
export function useIdleFinish(pending: boolean, connection: DbConnection, session: string): () => void {
  const client = useDbClient();
  const lastActive = useRef(Date.now());
  useEffect(() => {
    if (!pending) return;
    let timer: number | undefined;
    const check = async () => {
      const left = DB_SESSION_IDLE_MS - (Date.now() - lastActive.current);
      if (left > 0) {
        timer = window.setTimeout(() => void check(), left);
        return;
      }
      const done = await finishSession(client.projectId, connection, session, "10 分何もしていないので、接続を切ります");
      if (!done) {
        lastActive.current = Date.now();
        timer = window.setTimeout(() => void check(), DB_SESSION_IDLE_MS);
      }
    };
    timer = window.setTimeout(() => void check(), Math.max(0, DB_SESSION_IDLE_MS - (Date.now() - lastActive.current)));
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, connection.id, session]);
  return () => {
    lastActive.current = Date.now();
  };
}

/**
 * SQL のタブの結果の量を resultBudget に知らせ、捨てられたら結果のある文を「捨てた」にする。いま見ているタブに戻ったら、
 * 捨てた読み取りの文を流し直す（書く文はもう一度書き込んでしまうので流さない）。流している間（busy）は数えない
 */
export function useSqlResultBudget({
  tab,
  connection,
  worktree,
  active,
  busy,
  runs,
  setRuns,
}: {
  tab: DbSqlTab;
  connection: DbConnection;
  worktree: string | null;
  active: boolean;
  busy: boolean;
  runs: StatementRun[];
  setRuns: (runs: StatementRun[] | ((all: StatementRun[]) => StatementRun[])) => void;
}) {
  const client = useDbClient();
  const bytes = useMemo(() => runs.reduce((sum, r) => sum + (r.result ? estimateRowsBytes(r.result.rows) : 0), 0), [runs]);
  useResultBudget(`${client.place}:${tab.key}`, busy ? 0 : bytes, active, () =>
    setRuns((all) => all.map((r) => (r.result && r.result.columns.length > 0 ? { sql: r.sql, write: r.write, evicted: true } : r))),
  );
  const restoring = useRef(false);
  useEffect(() => {
    if (!active || busy || restoring.current || !runs.some((r) => r.evicted && isReadOnlyStatement(r.sql, connection.engine))) return;
    restoring.current = true;
    void (async () => {
      const next: StatementRun[] = [];
      for (const r of runs) {
        if (!r.evicted || !isReadOnlyStatement(r.sql, connection.engine)) {
          next.push(r);
          continue;
        }
        try {
          next.push({ sql: r.sql, write: r.write, result: await api.runDbSql(client.projectId, connection.id, { session: tab.key, sql: r.sql, write: r.write }, worktree) });
        } catch (e) {
          next.push({ sql: r.sql, write: r.write, error: errorMessage(e) });
        }
      }
      setRuns(next);
      restoring.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, busy, runs]);
}
