import type { DatabaseSync } from "node:sqlite";
import { normalizePrep, prepConfirmKey } from "@shared/database/dbPrep";
import { DB_ENVIRONMENT_DEFAULTS, type DbConnection } from "@shared/database/types";
import type { DbConnectionPatch, NewDbConnectionBody } from "@shared/database/api";
import { NOW } from "@/foundation/core/db/db";
import type { Notify } from "@/foundation/core/db/common";
import type { RowOf } from "@/foundation/core/db/table";
import type { SecretStore } from "@/foundation/core/settings/secretStore";
import { dbConnectionsTable } from "@/features/database/core/schema";
import { DB_SECRET_KINDS, dbSecretKey, type DbSecretKey, type DbSecretKind } from "@/features/database/core/secretKeys";

/** 変えられる列（パスワードは秘密の値なので別） */
const COLUMNS = ["name", "engine", "environment", "host", "port", "database", "username", "file_path", "ssl", "read_only", "write_check", "ai_access", "ai_username", "note_path", "ssh", "prep", "check_on", "check_note"] as const;

type Row = RowOf<(typeof dbConnectionsTable)["columns"]>;

/** 本文のうち変えられる列だけ（準備のコマンドは空の行・欄を落とし、何もなければ null） */
function columnsOf(body: DbConnectionPatch): Partial<Row> {
  const out: Record<string, unknown> = {};
  for (const c of COLUMNS) if (body[c] !== undefined) out[c] = body[c];
  if (body.prep !== undefined) out.prep = normalizePrep(body.prep);
  return out as Partial<Row>;
}

/**
 * DB クライアントの接続（db_connections の表。プロジェクトごとの並び position）。パスワードは秘密の値（secrets）に置き
 * （書く値はルートが DbSecretVault の seal で暗号化したもの）、
 * 行には保存したか（has_password）だけを付けて返す。変えたら db_connections の知らせ（中身なし）を出す
 */
export function createDbConnectionStore(db: DatabaseSync, onChange: Notify, secrets: SecretStore<DbSecretKey>) {
  const rows = dbConnectionsTable.on(db);
  const saved = (id: number, kind: DbSecretKind) => secrets.get(dbSecretKey(id, kind)) !== null;
  const toConnection = (row: Row): DbConnection => ({
    ...row,
    // 確かめた中身の写しといまの中身が同じ間だけ確かめ済み（中身を変えたら確かめ直す）
    prep_confirmed: row.prep !== null && row.prep_confirmed === prepConfirmKey(row.prep),
    has_password: saved(row.id, "password"),
    has_ai_password: saved(row.id, "ai_password"),
    has_ssh_password: saved(row.id, "ssh_password"),
  });
  const get = (id: number): DbConnection | undefined => {
    const row = rows.get(id);
    return row && toConnection(row);
  };
  const notify = (projectId: number) => onChange({ type: "db_connections", project_id: projectId });
  const setPasswords = (id: number, body: Pick<DbConnectionPatch, DbSecretKind>) => {
    for (const kind of DB_SECRET_KINDS) if (body[kind] !== undefined) secrets.set(dbSecretKey(id, kind), body[kind] ?? "");
  };
  return {
    get,
    list: (projectId: number): DbConnection[] => rows.list("project_id = ?", [projectId]).map(toConnection),
    /** 作る（worktreePath: Docker タブの「DB で開く」で、ワークツリーの DB から作ったとき） */
    create(projectId: number, body: NewDbConnectionBody, worktreePath: string | null = null): DbConnection {
      // 書き込む前の確かめを省いたら環境の既定
      const { id } = rows.insert({ ...columnsOf({ ...body, write_check: body.write_check ?? DB_ENVIRONMENT_DEFAULTS[body.environment].write_check }), project_id: projectId, worktree_path: worktreePath });
      setPasswords(id, body);
      notify(projectId);
      return get(id)!;
    },
    /** 書いた項目だけ変える（password: undefined はそのまま・null は消す） */
    update(id: number, patch: DbConnectionPatch): DbConnection {
      const { project_id } = rows.update(id, columnsOf(patch));
      db.prepare(`UPDATE db_connections SET updated_at = ${NOW} WHERE id = ?`).run(id);
      setPasswords(id, patch);
      notify(project_id);
      return get(id)!;
    },
    /**
     * 保存したままのパスワード（暗号化したもの。なければ null）。つなぐときは secrets.ts の DbSecretVault で開く。
     * ここで読むのは、写すとき（暗号化したまま写す）とテストだけ
     */
    storedSecret: (id: number, kind: DbSecretKind): string | null => secrets.get(dbSecretKey(id, kind)),
    /** いまの準備のコマンドを利用者が確かめた（写しを残す。中身を変えると確かめ済みでなくなる） */
    confirmPrep(id: number): DbConnection {
      const { prep, project_id } = rows.get(id)!;
      rows.update(id, { prep_confirmed: prep ? prepConfirmKey(prep) : null });
      notify(project_id);
      return get(id)!;
    },
    /** つながった時刻を残す（一覧の並びは変えない。知らせは出さない） */
    touchConnected(id: number) {
      db.prepare(`UPDATE db_connections SET last_connected_at = ${NOW} WHERE id = ?`).run(id);
    },
    /** ノートの名前を変えた・動かしたとき、それを手順ノートにしている接続の note_path を付け替える（フォルダなら中のノートのものも） */
    remapNotePath(projectId: number, from: string, to: string) {
      const found = rows.list("project_id = ? AND (note_path = ? OR substr(note_path, 1, length(?) + 1) = ? || '/')", [projectId, from, from, from]);
      if (found.length === 0) return;
      for (const r of found) rows.update(r.id, { note_path: r.note_path === from ? to : `${to}${r.note_path!.slice(from.length)}` });
      notify(projectId);
    },
    /** そのワークツリー（作業するフォルダ）の DB から作った接続（全プロジェクト。プロジェクトの順に並べる） */
    ofWorktree: (worktreePath: string): DbConnection[] =>
      rows
        .list("worktree_path = ?", [worktreePath])
        .sort((a, b) => a.project_id - b.project_id)
        .map(toConnection),
    /** ワークツリーを消したが接続は残すとき、どのワークツリーのものかを外す（あとで同じ場所に作ったワークツリーと結び付けない） */
    clearWorktree(worktreePath: string) {
      const found = rows.list("worktree_path = ?", [worktreePath]);
      for (const r of found) rows.update(r.id, { worktree_path: null });
      for (const projectId of new Set(found.map((r) => r.project_id))) notify(projectId);
    },
    /** 消す（パスワードの秘密の値は表のトリガーが消す） */
    delete(id: number) {
      const row = rows.get(id);
      if (!row) return;
      rows.remove(id);
      notify(row.project_id);
    },
  };
}
