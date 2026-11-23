// MySQL / MariaDB の読み方（DB・テーブル・ビューの一覧と構造。テーブルの場所は DB の名前で指す。関数・プロシージャは routines.ts）
import { DB_DIALECTS } from "@shared/database/dialect";
import { DB_OUTLINE_TABLES, type DbForeignKey, type DbIndex, type DbObject, type DbObjectPath } from "@shared/database/types";
import { tableNotFound } from "@/features/database/worker/common";
import type { DbCatalog, DbConn, DbRow } from "@/features/database/worker/conn";
import { mysqlDefinition, mysqlRoutineObjects } from "./routines";

const quoteName = DB_DIALECTS.mysql.quoteIdent;

/** テーブルのある DB（指定がなければ接続のいまの DB） */
async function databaseOf(conn: DbConn, path: DbObjectPath): Promise<string> {
  if (path.database) return path.database;
  const [row] = await conn.all("SELECT DATABASE() AS db");
  if (!row?.db) throw new Error("DB を選んでください（接続に DB 名がありません）");
  return String(row.db);
}

/** 外部キー（where: このテーブルから出るもの / このテーブルを指すもの）。列ごとの行を、外部キーごとにまとめる */
async function foreignKeys(conn: DbConn, where: string, db: string, name: string) {
  const rows = await conn.all(
    `SELECT k.CONSTRAINT_NAME AS name, k.TABLE_SCHEMA AS src_schema, k.TABLE_NAME AS src_table, k.COLUMN_NAME AS col,
       k.REFERENCED_TABLE_SCHEMA AS ref_schema, k.REFERENCED_TABLE_NAME AS ref_table, k.REFERENCED_COLUMN_NAME AS ref_col, r.UPDATE_RULE AS on_update, r.DELETE_RULE AS on_delete
     FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
     WHERE ${where} AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_SCHEMA, k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
    [db, name],
  );
  const byKey = new Map<string, DbForeignKey & { schema: string; table: string }>();
  for (const r of rows as DbRow[]) {
    const key = `${String(r.src_schema)}.${String(r.src_table)}.${String(r.name)}`;
    const fk = byKey.get(key) ?? {
      name: String(r.name),
      columns: [],
      ref_schema: String(r.ref_schema),
      ref_table: String(r.ref_table),
      ref_columns: [],
      on_update: r.on_update ? String(r.on_update) : null,
      on_delete: r.on_delete ? String(r.on_delete) : null,
      schema: String(r.src_schema),
      table: String(r.src_table),
    };
    fk.columns.push(String(r.col));
    fk.ref_columns.push(String(r.ref_col));
    byKey.set(key, fk);
  }
  return [...byKey.values()];
}

export const mysqlCatalog: DbCatalog = {
  async serverVersion(conn) {
    const [row] = await conn.all("SELECT VERSION() AS v");
    const v = String(row?.v ?? "");
    return v.includes("MariaDB") ? `MariaDB ${v.split("-")[0]}` : `MySQL ${v}`;
  },

  async databases(conn) {
    const names = (await conn.all("SHOW DATABASES")).map((r) => String(Object.values(r)[0]));
    const [row] = await conn.all("SELECT DATABASE() AS db");
    return { databases: names, current: row?.db ? String(row.db) : null, has_schemas: false };
  },

  async schemas() {
    return [];
  },

  async objects(conn, path) {
    const db = await databaseOf(conn, path);
    const rows = await conn.all("SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_ROWS AS est FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME", [db]);
    const relations = rows.map((r): DbObject => {
      const isView = String(r.type).includes("VIEW");
      return { kind: isView ? "view" : "table", name: String(r.name), estimated_rows: !isView && r.est !== null && r.est !== undefined ? Number(r.est) : null };
    });
    // テーブル・ビューのあとに関数・プロシージャ（MySQL の列挙型は列の型なので段にしない）
    return [...relations, ...(await mysqlRoutineObjects(conn, db))];
  },

  async definition(conn, path, kind, name) {
    if (kind === "enum") throw new Error("MySQL の列挙型は列の型で、ひとつの物としては見られません");
    return mysqlDefinition(conn, await databaseOf(conn, path), name);
  },

  async table(conn, path, name) {
    const db = await databaseOf(conn, path);
    const [info] = await conn.all(
      "SELECT TABLE_TYPE AS type, TABLE_ROWS AS est, DATA_LENGTH + INDEX_LENGTH AS size, TABLE_COMMENT AS comment FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [db, name],
    );
    if (!info) throw new Error(tableNotFound(name));
    const isView = String(info.type).includes("VIEW");
    const columns = (
      await conn.all(
        `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS dflt, COLUMN_KEY AS ckey, COLUMN_COMMENT AS comment
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
        [db, name],
      )
    ).map((r) => ({
      name: String(r.name),
      type: String(r.type),
      nullable: r.nullable === "YES",
      default: r.dflt === null ? null : String(r.dflt),
      primary_key: r.ckey === "PRI",
      comment: r.comment ? String(r.comment) : null,
    }));
    const byIndex = new Map<string, DbIndex>();
    for (const r of await conn.all(
      "SELECT INDEX_NAME AS name, NON_UNIQUE AS non_unique, COALESCE(COLUMN_NAME, '（式）') AS col FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME = 'PRIMARY' DESC, INDEX_NAME, SEQ_IN_INDEX",
      [db, name],
    )) {
      const key = String(r.name);
      const index = byIndex.get(key) ?? { name: key, columns: [], unique: Number(r.non_unique) === 0, primary: key === "PRIMARY" };
      index.columns.push(String(r.col));
      byIndex.set(key, index);
    }
    const outgoing = (await foreignKeys(conn, "k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ?", db, name)).map(({ schema: _s, table: _t, ...fk }) => fk);
    const referencedBy = await foreignKeys(conn, "k.REFERENCED_TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME = ?", db, name);
    const triggers = (
      await conn.all(
        "SELECT TRIGGER_NAME AS name, ACTION_TIMING AS timing, EVENT_MANIPULATION AS event FROM information_schema.TRIGGERS WHERE EVENT_OBJECT_SCHEMA = ? AND EVENT_OBJECT_TABLE = ? ORDER BY TRIGGER_NAME",
        [db, name],
      )
    ).map((r) => ({ name: String(r.name), timing: r.timing ? String(r.timing) : null, event: r.event ? String(r.event) : null }));
    const [create] = await conn.all(`SHOW CREATE ${isView ? "VIEW" : "TABLE"} ${quoteName(db)}.${quoteName(name)}`).catch(() => [] as DbRow[]);
    const ddl = create ? String(create["Create Table"] ?? create["Create View"] ?? "") || null : null;
    return {
      kind: isView ? "view" : "table",
      columns,
      indexes: [...byIndex.values()],
      foreign_keys: outgoing,
      referenced_by: referencedBy,
      triggers,
      ddl: ddl ? `${ddl};` : null,
      estimated_rows: !isView && info.est !== null ? Number(info.est) : null,
      size_bytes: !isView && info.size !== null ? Number(info.size) : null,
      comment: !isView && info.comment ? String(info.comment) : null,
    };
  },

  async outline(conn, path) {
    const db = await databaseOf(conn, path).catch(() => null);
    if (!db) return [];
    const byTable = new Map<string, string[]>();
    for (const r of await conn.all("SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION", [db])) {
      const table = String(r.t);
      if (!byTable.has(table) && byTable.size >= DB_OUTLINE_TABLES) break;
      byTable.set(table, [...(byTable.get(table) ?? []), String(r.c)]);
    }
    return [...byTable].map(([name, columns]) => ({ name, columns }));
  },

  async tableRef(conn, path, name) {
    return `${quoteName(await databaseOf(conn, path))}.${quoteName(name)}`;
  },
};
