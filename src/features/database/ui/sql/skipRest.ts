// SQL のタブで、失敗・止めた文のあとの文を「流していません」として並べる
import type { SqlStatement } from "@shared/database/sqlStatements";
import type { StatementRun } from "./SqlRunResult";

/** 流した文（done）の最後が失敗・止めたなら、残りの文を流していない文として後ろに足す（そうでなければ done のまま） */
export function skipRest(statements: readonly SqlStatement[], done: readonly StatementRun[], writing: boolean): StatementRun[] {
  const last = done.at(-1);
  if (!last || !(last.error || last.stopped)) return [...done];
  return [...done, ...statements.slice(done.length).map((s): StatementRun => ({ sql: s.text, write: writing, skipped: true }))];
}
