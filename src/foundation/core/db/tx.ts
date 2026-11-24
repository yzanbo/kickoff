import type { DatabaseSync } from "node:sqlite";

/** 入れ子の SAVEPOINT の名前に付ける番号（DB ごと） */
const depths = new WeakMap<Pick<DatabaseSync, "exec">, number>();

/**
 * 1 つのトランザクションで fn を流す（例外なら ROLLBACK して投げ直す）。すでにトランザクションの中なら SAVEPOINT で入れ子にし、
 * 失敗はその中だけを戻す。fn は同期だけ（待つ処理を挟むと、ほかの書き込みが同じトランザクションに混ざる）
 */
export function tx<T>(db: Pick<DatabaseSync, "exec" | "isTransaction">, fn: () => T, mode: "deferred" | "immediate" = "deferred"): T {
  const nested = db.isTransaction;
  const depth = (depths.get(db) ?? 0) + 1;
  const savepoint = `tx_${depth}`;
  db.exec(nested ? `SAVEPOINT ${savepoint}` : mode === "immediate" ? "BEGIN IMMEDIATE" : "BEGIN");
  depths.set(db, depth);
  try {
    const result = fn();
    if (result instanceof Promise) throw new Error("tx に渡す処理は同期にしてください");
    db.exec(nested ? `RELEASE ${savepoint}` : "COMMIT");
    return result;
  } catch (e) {
    db.exec(nested ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : "ROLLBACK");
    throw e;
  } finally {
    depths.set(db, depth - 1);
  }
}
