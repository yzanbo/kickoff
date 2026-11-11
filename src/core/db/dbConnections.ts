import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { DbConnection, DbConnectionPatch, DbSsl, NewDbConnectionBody } from "@shared/types";
import { NOW } from "./schema.js";
import { bit, updateRow, type Notify } from "./common.js";
import type { DbSecretKey } from "./settings.js";

/** 変えられる列（パスワードは秘密の値なので別） */
const COLUMNS = ["name", "engine", "environment", "host", "port", "database", "username", "file_path", "ssl", "read_only", "ai_access", "ai_username"] as const;

type Row = Omit<DbConnection, "ssl" | "read_only" | "has_password" | "has_ai_password"> & { ssl: string | null; read_only: number; has_password: number; has_ai_password: number };

const SELECT = `SELECT c.*,
  EXISTS (SELECT 1 FROM secrets WHERE key = 'db_connection:' || c.id || ':password') AS has_password,
  EXISTS (SELECT 1 FROM secrets WHERE key = 'db_connection:' || c.id || ':ai_password') AS has_ai_password
  FROM db_connections AS c`;

const toConnection = (row: Row): DbConnection => ({
  ...row,
  ssl: row.ssl ? (JSON.parse(row.ssl) as DbSsl) : null,
  read_only: row.read_only === 1,
  has_password: row.has_password === 1,
  has_ai_password: row.has_ai_password === 1,
});

/** 接続のパスワードの秘密の値の名前 */
export const dbPasswordKey = (id: number): DbSecretKey => `db_connection:${id}:password`;
/** AI 用のユーザーのパスワードの秘密の値の名前 */
export const dbAiPasswordKey = (id: number): DbSecretKey => `db_connection:${id}:ai_password`;

/**
 * DB クライアントの接続（db_connections の表。プロジェクトごとの並び position）。パスワードは秘密の値（secrets）に置き、
 * 行には保存したか（has_password）だけを付けて返す。変えたら db_connections の知らせ（中身なし）を出す
 */
export function createDbConnectionStore(db: DatabaseSync, onChange: Notify, secrets: { get(key: DbSecretKey): string | null; set(key: DbSecretKey, value: string): void }) {
  const get = (id: number): DbConnection | undefined => {
    const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(id) as unknown as Row | undefined;
    return row && toConnection(row);
  };
  const notify = (projectId: number) => onChange({ type: "db_connections", project_id: projectId });
  const toRow = (body: DbConnectionPatch): Record<string, SQLInputValue | undefined> => ({
    name: body.name,
    engine: body.engine,
    environment: body.environment,
    host: body.host,
    port: body.port,
    database: body.database,
    username: body.username,
    file_path: body.file_path,
    ssl: body.ssl === undefined ? undefined : body.ssl === null ? null : JSON.stringify(body.ssl),
    read_only: bit(body.read_only),
    ai_access: body.ai_access,
    ai_username: body.ai_username,
  });
  const setPasswords = (id: number, body: Pick<DbConnectionPatch, "password" | "ai_password">) => {
    if (body.password !== undefined) secrets.set(dbPasswordKey(id), body.password ?? "");
    if (body.ai_password !== undefined) secrets.set(dbAiPasswordKey(id), body.ai_password ?? "");
  };
  return {
    get,
    list(projectId: number): DbConnection[] {
      return (db.prepare(`${SELECT} WHERE c.project_id = ? ORDER BY c.position, c.id`).all(projectId) as unknown as Row[]).map(toConnection);
    },
    create(projectId: number, body: NewDbConnectionBody): DbConnection {
      const { next } = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM db_connections WHERE project_id = ?").get(projectId) as { next: number };
      const row = toRow(body);
      const { lastInsertRowid } = db
        .prepare(
          "INSERT INTO db_connections (project_id, name, engine, environment, host, port, database, username, file_path, ssl, read_only, ai_access, ai_username, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(projectId, ...COLUMNS.map((c) => row[c] ?? null), next);
      const id = Number(lastInsertRowid);
      setPasswords(id, body);
      notify(projectId);
      return get(id)!;
    },
    /** 書いた項目だけ変える（password: undefined はそのまま・null は消す） */
    update(id: number, patch: DbConnectionPatch): DbConnection {
      const before = get(id)!;
      updateRow(db, "db_connections", id, toRow(patch) as Record<string, SQLInputValue>, COLUMNS);
      db.prepare(`UPDATE db_connections SET updated_at = ${NOW} WHERE id = ?`).run(id);
      setPasswords(id, patch);
      notify(before.project_id);
      return get(id)!;
    },
    /** 保存したパスワード（なければ null。API には出さず、つなぐときだけコアの中で使う） */
    password(id: number): string | null {
      return secrets.get(dbPasswordKey(id));
    },
    /** AI 用のユーザーのパスワード（なければ null） */
    aiPassword(id: number): string | null {
      return secrets.get(dbAiPasswordKey(id));
    },
    /** つながった時刻を残す（一覧の並びは変えない。知らせは出さない） */
    touchConnected(id: number) {
      db.prepare(`UPDATE db_connections SET last_connected_at = ${NOW} WHERE id = ?`).run(id);
    },
    /** プロジェクトの中で ids の順に並べ直す（ほかのプロジェクトの接続・書いていない接続は、いまの順のまま後ろ） */
    reorder(projectId: number, ids: number[]): DbConnection[] {
      const current = this.list(projectId).map((c) => c.id);
      const head = ids.filter((id, i) => current.includes(id) && ids.indexOf(id) === i);
      const order = [...head, ...current.filter((id) => !head.includes(id))];
      const stmt = db.prepare("UPDATE db_connections SET position = ? WHERE id = ?");
      order.forEach((id, i) => stmt.run(i, id));
      notify(projectId);
      return this.list(projectId);
    },
    /** 消す（パスワードの秘密の値は表のトリガーが消す） */
    delete(id: number) {
      const connection = get(id);
      if (!connection) return;
      db.prepare("DELETE FROM db_connections WHERE id = ?").run(id);
      notify(connection.project_id);
    },
  };
}
