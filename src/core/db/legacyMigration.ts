// 古い系統（application_id のない Kickoff）の最後の版 v17 のデータベースを、いまの系統の v1 に変換する（1 回だけ。dbOpen.ts から呼ぶ）。
// ID はそのまま写し、以前の値（「セクションに合わせる」の権限モード・色のないプロジェクトなど）はここで読み替える（legacyValues.ts）
import type { DatabaseSync } from "node:sqlite";
import { errorMessage } from "@shared/errors";
import { isPermissionChoice, legacyProjectDefaults, legacyRunOptions, legacySettingValue } from "./legacyValues.js";
import { pickProjectHue } from "@shared/project/colors";
import { APPLICATION_ID, LEGACY_VERSION, SCHEMA_V1, USER_VERSION_BASE } from "./schema.js";
import { parseJson } from "./common.js";
import type { EffortLevel } from "@shared/types";

/** 写す表（行数を前後で照合する） */
const KEPT_TABLES = ["settings", "projects", "run_groups", "runs", "run_events"] as const;
/** 古い表。変換の間は legacy_<名前> に改名しておき、最後に消す（タスク・成果物は写さずに消す） */
const LEGACY_TABLES = [...KEPT_TABLES, "tasks", "artifacts"] as const;

/** 古い projects の行（使う列だけ） */
interface LegacyProject {
  id: number;
  name: string;
  description: string;
  repo_path: string;
  provider: string;
  hue: number | null;
  position: number;
  pinned: number;
  archived_at: string | null;
  defaults: string;
  reference_paths: string;
  created_at: string;
  updated_at: string;
}

const countRows = (db: DatabaseSync, table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

/** 古い表を legacy_<名前> に改名し、古い索引を消す（新しい表・索引の名前を空ける） */
function moveLegacyTablesAside(db: DatabaseSync) {
  for (const table of LEGACY_TABLES) db.exec(`ALTER TABLE ${table} RENAME TO legacy_${table}`);
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL").all() as { name: string }[];
  for (const { name } of indexes) db.exec(`DROP INDEX "${name}"`);
}

/** 設定（以前の「セクションに合わせる」の権限モードは「毎回確認」に） */
function copySettings(db: DatabaseSync) {
  const rows = db.prepare("SELECT key, value FROM legacy_settings").all() as { key: string; value: string }[];
  const insert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  for (const { key, value } of rows) insert.run(key, legacySettingValue(key, value));
}

/**
 * プロジェクト。色のないもの（色を覚える前に作ったもの）には、作った順に、ほかと被らない色を付ける。
 * 既定からは以前のセクション・カンバンの列・「セクションに合わせる」を除き、参照資料は配列でなければ空にする（以前の読み方と同じ）
 */
function copyProjects(db: DatabaseSync) {
  const rows = db.prepare("SELECT * FROM legacy_projects ORDER BY id").all() as unknown as LegacyProject[];
  const used = rows.flatMap((r) => (r.hue === null ? [] : [r.hue]));
  const insert = db.prepare(
    `INSERT INTO projects (id, name, description, repo_path, provider, hue, position, pinned, archived_at, defaults, reference_paths, created_at, active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of rows) {
    const hue = r.hue ?? pickProjectHue(used);
    if (r.hue === null) used.push(hue);
    const references = Array.isArray(parseJson(r.reference_paths || "[]")) ? r.reference_paths : "[]";
    const defaults = JSON.stringify(legacyProjectDefaults(parseJson(r.defaults)));
    insert.run(r.id, r.name, r.description, r.repo_path, r.provider, hue, r.position, r.pinned, r.archived_at, defaults, references, r.created_at, r.updated_at);
  }
}

/**
 * チャットとグループ・会話の記録。updated_at（最後に動いた時刻）は active_at に。
 * 権限モードが以前の「セクションに合わせる」（"phase"）のチャットだけ、その行のセクションの以前の既定に読み替える
 */
function copyRuns(db: DatabaseSync) {
  db.exec(`
    INSERT INTO run_groups (id, project_id, name, position, created_at)
    SELECT id, project_id, name, position, created_at FROM legacy_run_groups;
    INSERT INTO runs (id, project_id, group_id, title, provider, worktree_path, branch, model, effort, permission_mode, fast_mode,
                      status, session_id, turn_started_at, result, error, cost_usd, num_turns, context_tokens, context_window,
                      attention, pinned, archived_at, created_at, active_at)
    SELECT id, project_id, group_id, title, provider, worktree_path, branch, model, effort, permission_mode, fast_mode,
           status, session_id, turn_started_at, result, error, cost_usd, num_turns, context_tokens, context_window,
           attention, pinned, archived_at, created_at, updated_at
    FROM legacy_runs;
    INSERT INTO run_events (id, run_id, type, data, created_at)
    SELECT id, run_id, type, data, created_at FROM legacy_run_events;
  `);
  const rows = db.prepare("SELECT id, phase, effort, permission_mode FROM legacy_runs").all() as {
    id: number;
    phase: string;
    effort: EffortLevel | null;
    permission_mode: string;
  }[];
  const update = db.prepare("UPDATE runs SET effort = ?, permission_mode = ? WHERE id = ?");
  for (const row of rows) {
    if (isPermissionChoice(row.permission_mode)) continue;
    const { effort, permission_mode } = legacyRunOptions(row);
    update.run(effort, permission_mode, row.id);
  }
}

/** AUTOINCREMENT の番号の続きを写す（消した行の ID を使い回さない）。古い表の値と、写した行の ID の最大の大きいほう */
function copySequences(db: DatabaseSync) {
  const legacy = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = ?");
  for (const table of KEPT_TABLES.filter((t) => t !== "settings")) {
    const row = legacy.get(`legacy_${table}`) as { seq: number } | undefined;
    if (!row) continue;
    db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(table);
    db.prepare(`INSERT INTO sqlite_sequence (name, seq) SELECT ?, max(?, COALESCE((SELECT max(id) FROM ${table}), 0))`).run(table, row.seq);
  }
}

/** 変換の本体（トランザクションの中で呼ぶ）。行数・参照が合わなければ例外 */
function convert(db: DatabaseSync) {
  const before = Object.fromEntries(KEPT_TABLES.map((t) => [t, countRows(db, t)]));
  moveLegacyTablesAside(db);
  db.exec(SCHEMA_V1);
  copySettings(db);
  copyProjects(db);
  copyRuns(db);
  copySequences(db);
  for (const table of LEGACY_TABLES) db.exec(`DROP TABLE legacy_${table}`);
  db.exec("INSERT INTO run_event_search (run_event_search) VALUES ('rebuild')");
  for (const table of KEPT_TABLES) {
    const after = countRows(db, table);
    if (after !== before[table]) throw new Error(`${table} の行数が合いません（変換前 ${before[table]}、変換後 ${after}）`);
  }
  const broken = db.prepare("PRAGMA foreign_key_check").all() as { table: string; rowid: number; parent: string }[];
  if (broken.length > 0) {
    const examples = broken.slice(0, 5).map((v) => `${v.table} の ${v.rowid} → ${v.parent}`);
    throw new Error(`参照先のない行が ${broken.length} 件あります（${examples.join("、")}）`);
  }
  db.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${USER_VERSION_BASE + 1};`);
}

/**
 * 古い v17 のデータベースを、1 つのトランザクションでいまの系統の v1（user_version = USER_VERSION_BASE ＋ 1）に変換する。失敗したら元のまま（ROLLBACK）で、分かる文の例外を投げる。
 * 表を作り直す間だけ外部キーの検査を止め（トランザクションの外でしか切り替えられない）、最後に foreign_key_check で確かめる
 */
export function convertLegacyDatabase(db: DatabaseSync) {
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      convert(db);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`古いデータベース（v${LEGACY_VERSION}）の変換に失敗しました。データは元のままです（${errorMessage(e)}）`, { cause: e });
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}
