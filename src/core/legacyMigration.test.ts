import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { pickProjectHue } from "./projectColors.js";
import { APPLICATION_ID, SCHEMA_VERSION, schemaVersion } from "./schema.js";
import { Store } from "./store.js";
import { createLegacyV17 } from "./testing/legacySchemaV17.js";

const T = (n: number) => `2026-10-0${n}T00:00:00.000Z`;

/** 古い v17 の DB を作り、以前の値を含む行を入れる（消した行で番号を進めておく） */
function legacyFile() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-legacy-")), "kickoff.db");
  const db = new DatabaseSync(file);
  createLegacyV17(db);
  db.exec(`
    PRAGMA journal_mode = WAL;
    INSERT INTO settings VALUES ('defaultPermission', '"phase"'), ('claudeModel', '"opus"'), ('maxConcurrentRuns', '3');
    INSERT INTO projects (name, repo_path, defaults, updated_at) VALUES
      ('a', '/tmp/a', '{"model":"opus","section":"testing","stage":"todo","permission":"phase"}', '${T(1)}');
    INSERT INTO projects (name, repo_path, hue, pinned, archived_at, reference_paths, updated_at) VALUES
      ('b', '/tmp/b', 222, 1, '${T(2)}', '[{"path":"/tmp/spec","kind":"folder"}]', '${T(2)}');
    INSERT INTO projects (name, repo_path) VALUES ('消す', '/tmp/c');
    DELETE FROM projects WHERE id = 3;
    INSERT INTO tasks (project_id, phase, title) VALUES (1, 'implementation', 'タスク');
    INSERT INTO artifacts (project_id, phase, kind, title, content) VALUES (1, 'requirements', 'doc', '要件', '本文');
    INSERT INTO run_groups (project_id, name) VALUES (1, 'レビュー'), (1, '消す');
    DELETE FROM run_groups WHERE id = 2;
    INSERT INTO runs (project_id, phase, provider, title, status, permission_mode, effort, updated_at) VALUES
      (1, 'schedule', 'claude', 'r1', 'completed', 'phase', NULL, '${T(3)}'),
      (1, 'testing', 'claude', 'r2', 'completed', 'phase', 'low', '${T(4)}'),
      (1, 'requirements', 'claude', 'r3', 'failed', 'plan', NULL, '${T(5)}');
    INSERT INTO runs (project_id, task_id, phase, provider, status, permission_mode, group_id, stage, attention, pinned, fast_mode,
                      worktree_path, branch, cost_usd, num_turns, context_tokens, context_window, archived_at, updated_at) VALUES
      (1, 1, 'implementation', 'claude', 'completed', 'auto', 1, 'todo', 1, 1, 1, '/tmp/a-wt/feat', 'feat', 1.25, 3, 1200, 200000, '${T(6)}', '${T(7)}');
    INSERT INTO runs (project_id, phase, provider, status) VALUES (2, 'testing', 'claude', 'completed');
    DELETE FROM runs WHERE id = 5;
    INSERT INTO run_events (run_id, type, data) VALUES
      (1, 'user', '{"text":"ログイン方式は OAuth にしたい"}'),
      (1, 'tool_use', '{"id":"t1","name":"Read","input":{"text":"OAuth"}}'),
      (2, 'text', '{"text":"日本語の検索ができます"}'),
      (2, 'text', '{"text":"消す"}');
    DELETE FROM run_events WHERE id = 4;
  `);
  db.close();
  return file;
}

test("古い v17 の DB を変換する: ID・番号の続き・以前の値の読み替え・全文検索の索引を引き継ぎ、写しを残す", () => {
  const file = legacyFile();
  const store = new Store(file);
  const { db } = store;
  assert.equal((db.prepare("PRAGMA application_id").get() as { application_id: number }).application_id, APPLICATION_ID);
  assert.equal(schemaVersion(db), SCHEMA_VERSION);
  assert.deepEqual(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'run_event_search_%' ORDER BY name").all().map((r) => r.name),
    ["projects", "run_event_search", "run_events", "run_groups", "runs", "settings"],
  );
  assert.match(fs.readdirSync(path.join(path.dirname(file), "backups"))[0], /^kickoff-v17-/);

  // 設定: 「セクションに合わせる」は「毎回確認」に。ほかはそのまま
  const settings = store.getSettings();
  assert.deepEqual([settings.defaultPermission, settings.claudeModel, settings.maxConcurrentRuns], ["default", "opus", 3]);

  // プロジェクト: ID・最後に動いた時刻・固定・アーカイブ・参照資料はそのまま。色のないものに色を付け、既定から以前の値を除く
  const [a, b] = [store.getProject(1)!, store.getProject(2)!];
  assert.equal(a.hue, pickProjectHue([222]));
  assert.deepEqual(a.defaults, { model: "opus" });
  assert.equal(a.active_at, T(1));
  assert.deepEqual([b.hue, b.pinned, b.archived_at, b.references], [222, true, T(2), [{ path: "/tmp/spec", kind: "folder" }]]);
  assert.equal(store.getProject(3), undefined);

  // チャット: 「セクションに合わせる」のものだけ、そのセクションの以前の既定に（選んであった推論の深さは残す）
  const options = (id: number) => {
    const run = store.getRun(id)!;
    return [run.effort, run.permission_mode];
  };
  assert.deepEqual(options(1), ["medium", "default"]);
  assert.deepEqual(options(2), ["low", "acceptEdits"]);
  assert.deepEqual(options(3), [null, "plan"]);
  const r4 = store.getRun(4)!;
  assert.deepEqual(
    [r4.group_id, r4.attention, r4.pinned, r4.fast_mode, r4.worktree_path, r4.branch, r4.cost_usd, r4.num_turns, r4.context_tokens, r4.archived_at, r4.active_at],
    [1, true, true, true, "/tmp/a-wt/feat", "feat", 1.25, 3, 1200, T(6), T(7)],
  );
  for (const key of ["phase", "task_id", "stage"]) assert.equal(key in r4, false, key);
  assert.deepEqual(store.listGroups(1).map((g) => [g.id, g.name]), [[1, "レビュー"]]);
  assert.deepEqual(store.listEvents(1).map((e) => e.id), [1, 2]);

  // 全文検索の索引: 自分の発言と AI の返答の文だけが入り、中身と合っている
  const search = (q: string) => db.prepare("SELECT rowid FROM run_event_search WHERE run_event_search MATCH ? ORDER BY rowid").all(q).map((r) => r.rowid);
  assert.deepEqual(search('"oauth"'), [1]);
  assert.deepEqual(search('"日本語の"'), [3]);
  db.exec("INSERT INTO run_event_search (run_event_search) VALUES ('integrity-check')");

  // 番号の続き: 消した行の ID を使い回さない
  assert.equal(store.createProject({ name: "d", repo_path: "/tmp/d", provider: "claude" }).id, 4);
  assert.equal(store.createGroup(1, "新しい").id, 3);
  const run = store.createRun({ project_id: 1, provider: "claude", title: "新しい", status: "completed", model: null });
  assert.equal(run.id, 6);
  assert.equal(store.addEvent(run.id, { type: "user", text: "x" }).id, 5);
  store.close();

  // 開き直しても変換し直さない（写しも増えない）
  new Store(file).close();
  assert.equal(fs.readdirSync(path.join(path.dirname(file), "backups")).length, 1);
});

test("古い v17 の DB の変換: 参照先のない行があれば変換せず、元のまま分かる文の例外を投げる", () => {
  const file = legacyFile();
  const db = new DatabaseSync(file);
  // 外部キーの検査を止めていた間に入った（参照先のプロジェクトがない）チャット
  db.exec("PRAGMA foreign_keys = OFF; INSERT INTO runs (project_id, phase, provider, status) VALUES (99, 'testing', 'claude', 'completed');");
  db.close();
  assert.throws(() => new Store(file), /古いデータベース（v17）の変換に失敗しました。データは元のままです（参照先のない行が 1 件あります（runs の 6 → projects））/);
  const after = new DatabaseSync(file);
  assert.equal(schemaVersion(after), 17);
  assert.equal(after.prepare("SELECT count(*) AS n FROM runs").get()?.n, 5);
  assert.equal(after.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'legacy_%' OR name = 'run_event_search'").get()?.n, 0);
  after.close();
});
