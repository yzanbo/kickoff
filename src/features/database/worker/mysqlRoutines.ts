// MySQL / MariaDB のストアドルーチン（関数・プロシージャ。木の段と、開いたタブの定義）。mysql.ts から問い合わせの口を受けて使う
import type { DbDefinition, DbObject } from "@shared/types";

type Row = Record<string, unknown>;
type Query = (sql: string, values?: unknown[]) => Promise<Row[]>;

const quoteName = (name: string) => `\`${name.replaceAll("`", "``")}\``;

/** DB の関数・プロシージャ（どちらも「関数」の段に並べる） */
export async function mysqlRoutineObjects(run: Query, db: string): Promise<DbObject[]> {
  const rows = await run("SELECT ROUTINE_NAME AS name FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? GROUP BY ROUTINE_NAME ORDER BY ROUTINE_NAME", [db]);
  return rows.map((r) => ({ kind: "function" as const, name: String(r.name) }));
}

/** ルーチンの定義（同じ名前の関数とプロシージャがあれば関数。作る文は SHOW CREATE（権限がなければ本文だけ）） */
export async function mysqlDefinition(run: Query, db: string, name: string): Promise<DbDefinition> {
  const [routine] = await run(
    `SELECT ROUTINE_TYPE AS type, DTD_IDENTIFIER AS returns, ROUTINE_DEFINITION AS body, ROUTINE_COMMENT AS comment
     FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME = ? ORDER BY ROUTINE_TYPE = 'FUNCTION' DESC LIMIT 1`,
    [db, name],
  );
  if (!routine) throw new Error(`関数が見つかりません: ${name}`);
  const type = String(routine.type) === "PROCEDURE" ? "PROCEDURE" : "FUNCTION";
  const params = await run(
    `SELECT PARAMETER_MODE AS mode, PARAMETER_NAME AS name, DTD_IDENTIFIER AS type FROM information_schema.PARAMETERS
     WHERE SPECIFIC_SCHEMA = ? AND SPECIFIC_NAME = ? AND ROUTINE_TYPE = ? AND ORDINAL_POSITION > 0 ORDER BY ORDINAL_POSITION`,
    [db, name, type],
  );
  // 関数の引数は IN だけなので向きを書かない。プロシージャは IN / OUT / INOUT を添える
  const args = params.map((p) => [type === "PROCEDURE" ? p.mode : null, p.name, p.type].filter((v) => v !== null && v !== undefined && v !== "").map(String).join(" ")).join(", ");
  let ddl: string | null = null;
  try {
    const [created] = await run(`SHOW CREATE ${type} ${quoteName(db)}.${quoteName(name)}`);
    const text = created?.[type === "FUNCTION" ? "Create Function" : "Create Procedure"];
    if (typeof text === "string" && text) ddl = text;
  } catch {
    // 作った人でなく SHOW_ROUTINE の権限もなければ読めない（本文だけを出す）
  }
  return {
    kind: "function",
    arguments: args,
    returns: type === "FUNCTION" && routine.returns ? String(routine.returns) : null,
    values: [],
    ddl: ddl ?? (routine.body ? String(routine.body) : null),
    comment: routine.comment ? String(routine.comment) : null,
  };
}
