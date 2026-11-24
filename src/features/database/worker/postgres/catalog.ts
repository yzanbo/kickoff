// PostgreSQL の読み方（DB・スキーマ・テーブル・ビューの一覧と構造。関数・列挙型は routines.ts、作る文は ddl.ts）
import { DB_DIALECTS } from "@shared/database/dialect";
import { DB_OUTLINE_TABLES, type DbForeignKey, type DbIndex, type DbObject, type DbObjectPath } from "@shared/database/types";
import { tableNotFound } from "@/features/database/worker/common";
import type { DbCatalog, DbConn, DbRow } from "@/features/database/worker/conn";
import { triggerHead } from "@/features/database/worker/values";
import { pgDdl, type PgRelation } from "./ddl";
import { pgDefinition, pgRoutineObjects } from "./routines";

const { quoteIdent } = DB_DIALECTS.postgres;

/** 外部キーの動き（pg_constraint の 1 文字） */
const FK_ACTIONS: Record<string, string> = { a: "NO ACTION", r: "RESTRICT", c: "CASCADE", n: "SET NULL", d: "SET DEFAULT" };

/** テーブル・ビューとして木に出す relkind（表・分割した表・ビュー・実体化ビュー・外部テーブル） */
const RELKINDS = "('r', 'p', 'v', 'm', 'f')";

const isViewKind = (relkind: string) => relkind === "v" || relkind === "m";

/** テーブルの oid と情報（スキーマが null ならいまのスキーマ） */
async function relation(conn: DbConn, path: DbObjectPath, name: string): Promise<PgRelation & { reltuples: number; size: string | null }> {
  const [row] = await conn.all(
    `SELECT c.oid, c.relkind, n.nspname, c.reltuples, pg_total_relation_size(c.oid) AS size, obj_description(c.oid, 'pg_class') AS comment
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = COALESCE($1, current_schema()) AND c.relname = $2 AND c.relkind IN ${RELKINDS}`,
    [path.schema, name],
  );
  if (!row) throw new Error(tableNotFound(name));
  return row as unknown as PgRelation & { reltuples: number; size: string | null };
}

/** 外部キー（side: このテーブルから出るもの conrelid / このテーブルを指すもの confrelid） */
async function foreignKeys(conn: DbConn, oid: number, side: "conrelid" | "confrelid") {
  const rows = await conn.all(
    `SELECT con.conname,
       ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n ORDER BY k.o) AS cols,
       ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(n, o) JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.n ORDER BY k.o) AS ref_cols,
       fn.nspname AS ref_schema, fc.relname AS ref_table, sn.nspname AS src_schema, sc.relname AS src_table, con.confupdtype, con.confdeltype
     FROM pg_constraint con
       JOIN pg_class fc ON fc.oid = con.confrelid JOIN pg_namespace fn ON fn.oid = fc.relnamespace
       JOIN pg_class sc ON sc.oid = con.conrelid JOIN pg_namespace sn ON sn.oid = sc.relnamespace
     WHERE con.contype = 'f' AND con.${side} = $1 ORDER BY con.conname`,
    [oid],
  );
  return rows.map((r: DbRow) => {
    const fk: DbForeignKey = {
      name: String(r.conname),
      columns: (r.cols as string[]) ?? [],
      ref_schema: String(r.ref_schema),
      ref_table: String(r.ref_table),
      ref_columns: (r.ref_cols as string[]) ?? [],
      on_update: FK_ACTIONS[String(r.confupdtype)] ?? null,
      on_delete: FK_ACTIONS[String(r.confdeltype)] ?? null,
    };
    return { fk, schema: String(r.src_schema), table: String(r.src_table) };
  });
}

export const postgresCatalog: DbCatalog = {
  async serverVersion(conn) {
    const [row] = await conn.all("SHOW server_version");
    return `PostgreSQL ${String(row?.server_version ?? "").split(" ")[0]}`;
  },

  async databases(conn) {
    const rows = await conn.all("SELECT datname, current_database() AS current FROM pg_database WHERE datallowconn AND NOT datistemplate ORDER BY datname");
    const current = String(rows[0]?.current ?? (await conn.all("SELECT current_database() AS current"))[0]?.current ?? "");
    return { databases: rows.map((r) => String(r.datname)), current: current || null, has_schemas: true };
  },

  async schemas(conn) {
    return (await conn.all("SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY nspname")).map((r) => String(r.nspname));
  },

  async objects(conn, path) {
    const rows = await conn.all(
      `SELECT c.relname, c.relkind, c.reltuples FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = COALESCE($1, current_schema()) AND c.relkind IN ${RELKINDS} AND NOT c.relispartition ORDER BY c.relname`,
      [path.schema],
    );
    const relations = rows.map((r): DbObject => {
      const isView = isViewKind(String(r.relkind));
      // 統計を取る前の reltuples は -1（PostgreSQL 14 以降）
      const est = Number(r.reltuples);
      return { kind: isView ? "view" : "table", name: String(r.relname), estimated_rows: !isView && est >= 0 ? Math.round(est) : null };
    });
    // テーブル・ビューのあとに関数・列挙型
    return [...relations, ...(await pgRoutineObjects(conn, path.schema))];
  },

  definition(conn, path, kind, name) {
    return pgDefinition(conn, path.schema, kind, name);
  },

  async table(conn, path, name) {
    const rel = await relation(conn, path, name);
    const isView = isViewKind(rel.relkind);
    const columns = (
      await conn.all(
        `SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable, pg_get_expr(d.adbin, d.adrelid) AS dflt,
           col_description(a.attrelid, a.attnum) AS comment,
           EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY (i.indkey)) AS pk
         FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
        [rel.oid],
      )
    ).map((r) => ({
      name: String(r.attname),
      type: String(r.type),
      nullable: Boolean(r.nullable),
      default: r.dflt === null ? null : String(r.dflt),
      primary_key: Boolean(r.pk),
      comment: r.comment === null ? null : String(r.comment),
    }));
    const indexRows = await conn.all(
      `SELECT ic.relname, i.indisunique, i.indisprimary, pg_get_indexdef(i.indexrelid) AS def,
         ARRAY(SELECT pg_get_indexdef(i.indexrelid, k, true) FROM generate_series(1, i.indnkeyatts) k) AS cols,
         EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid) AS by_constraint
       FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid WHERE i.indrelid = $1 ORDER BY i.indisprimary DESC, ic.relname`,
      [rel.oid],
    );
    const indexes: DbIndex[] = indexRows.map((r) => ({ name: String(r.relname), columns: (r.cols as string[]) ?? [], unique: Boolean(r.indisunique), primary: Boolean(r.indisprimary) }));
    const outgoing = (await foreignKeys(conn, rel.oid, "conrelid")).map((r) => r.fk);
    const referencedBy = (await foreignKeys(conn, rel.oid, "confrelid")).map((r) => ({ ...r.fk, schema: r.schema, table: r.table }));
    const triggers = (await conn.all("SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgrelid = $1 AND NOT tgisinternal ORDER BY tgname", [rel.oid])).map((r) => ({
      name: String(r.tgname),
      ...triggerHead(String(r.def)),
    }));
    const ddl = await pgDdl(conn, rel, columns, indexRows, triggers.length > 0);
    return {
      kind: isView ? "view" : "table",
      columns,
      indexes,
      foreign_keys: outgoing,
      referenced_by: referencedBy,
      triggers,
      ddl,
      estimated_rows: !isView && rel.reltuples >= 0 ? Math.round(rel.reltuples) : null,
      size_bytes: !isView && rel.size !== null ? Number(rel.size) : null,
      comment: rel.comment,
    };
  },

  async outline(conn, path) {
    const rows = await conn.all(
      `SELECT c.relname, ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum) AS cols
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = COALESCE($1, current_schema()) AND c.relkind IN ${RELKINDS} AND NOT c.relispartition ORDER BY c.relname LIMIT ${DB_OUTLINE_TABLES}`,
      [path.schema],
    );
    return rows.map((r) => ({ name: String(r.relname), columns: (r.cols as string[]) ?? [] }));
  },

  async tableRef(conn, path, name) {
    const rel = await relation(conn, path, name);
    return `${quoteIdent(rel.nspname)}.${quoteIdent(name)}`;
  },
};
