import { DatabaseSync } from "node:sqlite";
import { timed } from "@/foundation/core/system/stallWatch";

/** 保存先の中のデータベースのファイル名 */
export const DB_FILE = "kickoff.db";

/** SQLite で今の時刻（ISO 8601・ミリ秒まで）を作る式 */
export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Kickoff のデータベースの印（PRAGMA application_id。'KICK'） */
export const APPLICATION_ID = 0x4b49434b;

/** PRAGMA user_version は、この数に版を足して持つ（v1 = 301。前の系統の 200 ＋ 版・リリース前の 100 ＋ 版とは別） */
export const USER_VERSION_BASE = 300;

/** スキーマの 1 版（版ごとに 1 つのトランザクションで流す。組み立ては @/app/core/migrations.ts） */
export interface Migration {
  readonly version: number;
  readonly sql: string;
}

/** データベースの系統と版。empty: 作ったばかり（空） / current: いまの系統の v<version> */
export type SchemaState = { kind: "empty" } | { kind: "current"; version: number };

const pragmaNumber = (db: DatabaseSync, name: "user_version" | "application_id") =>
  (db.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[name];

/**
 * 開いたデータベースが何かを調べる（読むだけ）。印が 'KICK' で user_version が 301〜300＋latest か、空の DB だけを通し、
 * ほか（ほかのアプリ・前の系統・リリース前・このアプリより新しい版）は、データに触らずに例外を投げる
 */
export function inspectSchema(db: DatabaseSync, latest: number): SchemaState {
  const applicationId = pragmaNumber(db, "application_id");
  const raw = pragmaNumber(db, "user_version");
  if (applicationId === APPLICATION_ID && raw > USER_VERSION_BASE && raw <= USER_VERSION_BASE + latest) {
    return { kind: "current", version: raw - USER_VERSION_BASE };
  }
  if (applicationId === 0 && raw === 0) {
    const { objects } = db.prepare("SELECT count(*) AS objects FROM sqlite_master").get() as { objects: number };
    if (objects === 0) return { kind: "empty" };
  }
  throw new Error(
    `Kickoff のデータベースではないか、対応していない版のため開けません（application_id = ${applicationId}、user_version = ${raw}）。データには触れていません`,
  );
}

/** いまの版より新しい版を順に流す（版ごとに 1 つのトランザクション。印と user_version も同じトランザクションで付ける） */
function migrate(db: DatabaseSync, migrations: readonly Migration[], from: number) {
  for (const m of migrations) {
    if (m.version <= from) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${USER_VERSION_BASE + m.version};`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

/**
 * Kickoff のデータベースを開く: 何のデータベースかを触る前に調べる（違えば例外）→ WAL・外部キー → 版をそろえる → 詰まりの見張りの名前付け
 */
export const openDb = timed("boot:openDatabase", (file: string, migrations: readonly Migration[]): DatabaseSync => {
  const db = new DatabaseSync(file);
  try {
    // WAL にするとファイルが変わるので、その前に調べる
    const state = inspectSchema(db, migrations.at(-1)?.version ?? 0);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    timed("boot:migrate", migrate)(db, migrations, state.kind === "current" ? state.version : 0);
    return timeStatements(db);
  } catch (e) {
    db.close();
    throw e;
  }
});

/**
 * 詰まりの見張り（system/stallWatch.ts）に SQL の名前を付ける: prepare を包み、文の run / get / all / iterate と exec を
 * 「sqlite:<select|insert|update|delete> <表>」の名前で測る（名前は遅かったときだけ作る）。店のコードは変えない
 */
function timeStatements(db: DatabaseSync): DatabaseSync {
  const prepare = db.prepare.bind(db);
  const exec = db.exec.bind(db);
  db.prepare = (sql, options) => {
    const label = () => sqliteLabel(sql);
    const stmt = timed(label, prepare)(sql, options);
    stmt.run = timed(label, stmt.run.bind(stmt)) as typeof stmt.run;
    stmt.get = timed(label, stmt.get.bind(stmt)) as typeof stmt.get;
    stmt.all = timed(label, stmt.all.bind(stmt)) as typeof stmt.all;
    // iterate は作るときだけ（読み進める分は呼んだ側の時間に入る）
    stmt.iterate = timed(label, stmt.iterate.bind(stmt)) as typeof stmt.iterate;
    return stmt;
  };
  db.exec = timed(sqliteLabel, exec);
  return db;
}

/** SQL の頭から、詰まりの記録に書く名前を作る（「sqlite:select chat_events」など。表が読めなければ動詞だけ） */
export function sqliteLabel(sql: string): string {
  const head = sql.trimStart();
  const verb = (/^\w+/.exec(head)?.[0] ?? "?").toLowerCase();
  const table =
    verb === "insert" || verb === "replace"
      ? /\bINTO\s+["`[]?(\w+)/i.exec(head)?.[1]
      : verb === "update"
        ? /^UPDATE\s+(?:OR\s+\w+\s+)?["`[]?(\w+)/i.exec(head)?.[1]
        : /\bFROM\s+["`[]?(\w+)/i.exec(head)?.[1];
  return table ? `sqlite:${verb} ${table}` : `sqlite:${verb}`;
}
