import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { normalizePrep, prepConfirmKey } from "@shared/database/dbPrep";
import { DB_ENVIRONMENT_DEFAULTS, type DbConnection, type DbConnectionPatch, type DbPrep, type DbSsh, type DbSsl, type NewDbConnectionBody } from "@shared/types";
import { NOW } from "./schema.js";
import { bit, updateRow, type Notify } from "./common.js";
import type { DbSecretKey } from "./settings.js";

/** 変えられる列（パスワードは秘密の値なので別） */
const COLUMNS = ["name", "engine", "environment", "host", "port", "database", "username", "file_path", "ssl", "read_only", "write_check", "ai_access", "ai_username", "memo_path", "ssh", "prep", "check_on", "check_note"] as const;

type Row = Omit<DbConnection, "ssl" | "ssh" | "prep" | "prep_confirmed" | "read_only" | "has_password" | "has_ai_password" | "has_ssh_password"> & {
  ssl: string | null;
  ssh: string | null;
  prep: string | null;
  prep_confirmed: string | null;
  read_only: number;
  has_password: number;
  has_ai_password: number;
  has_ssh_password: number;
};

const SELECT = `SELECT c.*,
  EXISTS (SELECT 1 FROM secrets WHERE key = 'db_connection:' || c.id || ':password') AS has_password,
  EXISTS (SELECT 1 FROM secrets WHERE key = 'db_connection:' || c.id || ':ai_password') AS has_ai_password,
  EXISTS (SELECT 1 FROM secrets WHERE key = 'db_connection:' || c.id || ':ssh_password') AS has_ssh_password
  FROM db_connections AS c`;

const toConnection = (row: Row): DbConnection => {
  const prep = row.prep ? (JSON.parse(row.prep) as DbPrep) : null;
  return {
    ...row,
    ssl: row.ssl ? (JSON.parse(row.ssl) as DbSsl) : null,
    ssh: row.ssh ? (JSON.parse(row.ssh) as DbSsh) : null,
    prep,
    // 確かめた中身の写しといまの中身が同じ間だけ確かめ済み（中身を変えたら確かめ直す）
    prep_confirmed: prep !== null && row.prep_confirmed === prepConfirmKey(prep),
    read_only: row.read_only === 1,
    has_password: row.has_password === 1,
    has_ai_password: row.has_ai_password === 1,
    has_ssh_password: row.has_ssh_password === 1,
  };
};

/** 保存する準備のコマンド（空の行・欄を落とし、何もなければ null） */
function prepText(prep: DbPrep | null): string | null {
  const normalized = normalizePrep(prep);
  return normalized ? JSON.stringify(normalized) : null;
}

/** 接続のパスワードの秘密の値の名前 */
export const dbPasswordKey = (id: number): DbSecretKey => `db_connection:${id}:password`;
/** AI 用のユーザーのパスワードの秘密の値の名前 */
export const dbAiPasswordKey = (id: number): DbSecretKey => `db_connection:${id}:ai_password`;
/** SSH のパスワードの秘密の値の名前 */
export const dbSshPasswordKey = (id: number): DbSecretKey => `db_connection:${id}:ssh_password`;

/**
 * DB クライアントの接続（db_connections の表。プロジェクトごとの並び position）。パスワードは秘密の値（secrets）に置き
 * （書く値はルートが DbSecretVault の seal で暗号化したもの）、
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
    write_check: body.write_check,
    ai_access: body.ai_access,
    ai_username: body.ai_username,
    memo_path: body.memo_path,
    ssh: body.ssh === undefined ? undefined : body.ssh === null ? null : JSON.stringify(body.ssh),
    prep: body.prep === undefined ? undefined : prepText(body.prep),
    check_on: body.check_on,
    check_note: body.check_note,
  });
  const setPasswords = (id: number, body: Pick<DbConnectionPatch, "password" | "ai_password" | "ssh_password">) => {
    if (body.password !== undefined) secrets.set(dbPasswordKey(id), body.password ?? "");
    if (body.ai_password !== undefined) secrets.set(dbAiPasswordKey(id), body.ai_password ?? "");
    if (body.ssh_password !== undefined) secrets.set(dbSshPasswordKey(id), body.ssh_password ?? "");
  };
  return {
    get,
    list(projectId: number): DbConnection[] {
      return (db.prepare(`${SELECT} WHERE c.project_id = ? ORDER BY c.position, c.id`).all(projectId) as unknown as Row[]).map(toConnection);
    },
    /** 作る（worktreePath: Docker タブの「DB で開く」で、ワークツリーの DB から作ったとき） */
    create(projectId: number, body: NewDbConnectionBody, worktreePath: string | null = null): DbConnection {
      const { next } = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM db_connections WHERE project_id = ?").get(projectId) as { next: number };
      // 書き込む前の確かめを省いたら環境の既定
      const row = toRow({ ...body, write_check: body.write_check ?? DB_ENVIRONMENT_DEFAULTS[body.environment].write_check });
      const { lastInsertRowid } = db
        .prepare(
          "INSERT INTO db_connections (project_id, name, engine, environment, host, port, database, username, file_path, ssl, read_only, write_check, ai_access, ai_username, memo_path, ssh, prep, check_on, check_note, position, worktree_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(projectId, ...COLUMNS.map((c) => row[c] ?? null), next, worktreePath);
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
    /**
     * 保存したままのパスワード（暗号化したもの。なければ null）。つなぐときは databases/secrets.ts の DbSecretVault で開く。
     * ここで読むのは、写すとき（暗号化したまま写す）とテストだけ
     */
    password(id: number): string | null {
      return secrets.get(dbPasswordKey(id));
    },
    /** AI 用のユーザーの保存したままのパスワード（なければ null） */
    aiPassword(id: number): string | null {
      return secrets.get(dbAiPasswordKey(id));
    },
    /** SSH の保存したままのパスワード（なければ null） */
    sshPassword(id: number): string | null {
      return secrets.get(dbSshPasswordKey(id));
    },
    /** いまの準備のコマンドを利用者が確かめた（写しを残す。中身を変えると確かめ済みでなくなる） */
    confirmPrep(id: number): DbConnection {
      const connection = get(id)!;
      db.prepare("UPDATE db_connections SET prep_confirmed = ? WHERE id = ?").run(connection.prep ? prepConfirmKey(connection.prep) : null, id);
      notify(connection.project_id);
      return get(id)!;
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
    /** メモの名前を変えた・動かしたとき、それを手順メモにしている接続の memo_path を付け替える（フォルダなら中のメモのものも） */
    remapMemoPath(projectId: number, from: string, to: string) {
      const rows = db
        .prepare("SELECT id, memo_path FROM db_connections WHERE project_id = ? AND (memo_path = ? OR substr(memo_path, 1, length(?) + 1) = ? || '/')")
        .all(projectId, from, from, from) as { id: number; memo_path: string }[];
      if (rows.length === 0) return;
      const stmt = db.prepare("UPDATE db_connections SET memo_path = ? WHERE id = ?");
      for (const r of rows) stmt.run(r.memo_path === from ? to : `${to}${r.memo_path.slice(from.length)}`, r.id);
      notify(projectId);
    },
    /** そのワークツリー（作業するフォルダ）の DB から作った接続（全プロジェクト） */
    ofWorktree(worktreePath: string): DbConnection[] {
      return (db.prepare(`${SELECT} WHERE c.worktree_path = ? ORDER BY c.project_id, c.position, c.id`).all(worktreePath) as unknown as Row[]).map(toConnection);
    },
    /** ワークツリーを消したが接続は残すとき、どのワークツリーのものかを外す（あとで同じ場所に作ったワークツリーと結び付けない） */
    clearWorktree(worktreePath: string) {
      const projects = db.prepare("SELECT DISTINCT project_id FROM db_connections WHERE worktree_path = ?").all(worktreePath) as { project_id: number }[];
      db.prepare("UPDATE db_connections SET worktree_path = NULL WHERE worktree_path = ?").run(worktreePath);
      for (const p of projects) notify(p.project_id);
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
