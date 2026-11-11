// PostgreSQL の関数・列挙型（木の段と、開いたタブの定義）。postgres.ts から問い合わせの口を受けて使う
import type { DbDefinition, DbObject } from "@shared/types";
import { quoteIdent } from "./values.js";

type Row = Record<string, unknown>;
type Query = (sql: string, values?: unknown[]) => Promise<Row[]>;

/** 関数の名前（同じ名前で引数の違うものがあるので、引数の型を添えて見分ける） */
const FUNCTION_LABEL = "p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'";

/** スキーマの関数（拡張機能が入れたものは除く。集約関数・ウィンドウ関数も除く）と列挙型 */
export async function pgRoutineObjects(all: Query, schema: string | null): Promise<DbObject[]> {
  const functions = await all(
    `SELECT ${FUNCTION_LABEL} AS label FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = COALESCE($1, current_schema()) AND p.prokind IN ('f', 'p')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
     ORDER BY p.proname, label`,
    [schema],
  );
  const enums = await all(
    `SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = COALESCE($1, current_schema()) AND t.typtype = 'e'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
     ORDER BY t.typname`,
    [schema],
  );
  return [...functions.map((r) => ({ kind: "function" as const, name: String(r.label) })), ...enums.map((r) => ({ kind: "enum" as const, name: String(r.typname) }))];
}

/** 関数・列挙型の定義（関数は pg_get_functiondef、列挙型は値から作る文を組み立てる） */
export async function pgDefinition(all: Query, schema: string | null, kind: "function" | "enum", name: string): Promise<DbDefinition> {
  if (kind === "function") {
    const [row] = await all(
      `SELECT pg_get_functiondef(p.oid) AS ddl, pg_get_function_arguments(p.oid) AS args,
         CASE WHEN p.prokind = 'p' THEN NULL ELSE pg_get_function_result(p.oid) END AS returns, obj_description(p.oid, 'pg_proc') AS comment
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = COALESCE($1, current_schema()) AND ${FUNCTION_LABEL} = $2 AND p.prokind IN ('f', 'p')`,
      [schema, name],
    );
    if (!row) throw new Error(`関数が見つかりません: ${name}`);
    return {
      kind,
      arguments: row.args === null ? null : String(row.args),
      returns: row.returns === null ? null : String(row.returns),
      values: [],
      ddl: row.ddl === null ? null : String(row.ddl),
      comment: row.comment === null ? null : String(row.comment),
    };
  }
  const [type] = await all(
    `SELECT t.oid, n.nspname, obj_description(t.oid, 'pg_type') AS comment FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = COALESCE($1, current_schema()) AND t.typname = $2 AND t.typtype = 'e'`,
    [schema, name],
  );
  if (!type) throw new Error(`列挙型が見つかりません: ${name}`);
  const values = (await all("SELECT enumlabel FROM pg_enum WHERE enumtypid = $1 ORDER BY enumsortorder", [type.oid])).map((r) => String(r.enumlabel));
  const literal = (v: string) => `'${v.replaceAll("'", "''")}'`;
  return {
    kind,
    arguments: null,
    returns: null,
    values,
    ddl: `CREATE TYPE ${quoteIdent(String(type.nspname))}.${quoteIdent(name)} AS ENUM (${values.map(literal).join(", ")});`,
    comment: type.comment === null ? null : String(type.comment),
  };
}
