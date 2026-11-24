// PostgreSQL の表・ビューの作る文（PostgreSQL は表の作る文を返さないので、列・制約・インデックス・トリガーから組み立てる。ビューは定義から）
import { DB_DIALECTS } from "@shared/database/dialect";
import type { DbTableDetail } from "@shared/database/types";
import type { DbConn, DbRow } from "@/features/database/worker/conn";

const { quoteIdent, literal } = DB_DIALECTS.postgres;

/** 作る文に要るテーブルの情報（pg_class の行） */
export interface PgRelation {
  oid: number;
  relkind: string;
  nspname: string;
  comment: string | null;
}

export async function pgDdl(conn: DbConn, rel: PgRelation, columns: DbTableDetail["columns"], indexRows: DbRow[], hasTriggers: boolean): Promise<string> {
  const qualified = `${quoteIdent(rel.nspname)}.${quoteIdent((await conn.all("SELECT relname FROM pg_class WHERE oid = $1", [rel.oid]))[0]?.relname as string)}`;
  if (rel.relkind === "v" || rel.relkind === "m") {
    const [row] = await conn.all("SELECT pg_get_viewdef($1::oid, true) AS def", [rel.oid]);
    return `CREATE ${rel.relkind === "m" ? "MATERIALIZED VIEW" : "VIEW"} ${qualified} AS\n${String(row?.def ?? "").trim()}`;
  }
  const constraints = await conn.all(
    "SELECT conname, pg_get_constraintdef(oid, true) AS def FROM pg_constraint WHERE conrelid = $1 AND contype IN ('p', 'u', 'f', 'c', 'x') ORDER BY contype = 'p' DESC, conname",
    [rel.oid],
  );
  const lines = [
    ...columns.map((c) => `  ${quoteIdent(c.name)} ${c.type}${c.default !== null ? ` DEFAULT ${c.default}` : ""}${c.nullable ? "" : " NOT NULL"}`),
    ...constraints.map((c) => `  CONSTRAINT ${quoteIdent(String(c.conname))} ${String(c.def)}`),
  ];
  const parts = [`CREATE TABLE ${qualified} (\n${lines.join(",\n")}\n);`];
  for (const i of indexRows) if (!i.by_constraint) parts.push(`${String(i.def)};`);
  if (hasTriggers) for (const t of await conn.all("SELECT pg_get_triggerdef(oid, true) AS def FROM pg_trigger WHERE tgrelid = $1 AND NOT tgisinternal ORDER BY tgname", [rel.oid])) parts.push(`${String(t.def)};`);
  if (rel.comment) parts.push(`COMMENT ON TABLE ${qualified} IS ${literal(rel.comment)};`);
  return parts.join("\n\n");
}
