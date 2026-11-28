import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";
import { DB_FILE, USER_VERSION_BASE, openDb } from "@/foundation/core/db/db";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { MIGRATIONS } from "./migrations";

test("移行 v2: v1 の DB を開くと projects に種類の列（kind）が足され、あったプロジェクトはふつうのプロジェクト（NULL）のまま", () => {
  const file = path.join(tempDir(), DB_FILE);
  const v1 = openDb(file, MIGRATIONS.slice(0, 1));
  v1.prepare("INSERT INTO projects (name, repo_path, provider, hue, position) VALUES ('p', '/tmp/p', 'claude', 0, 1)").run();
  v1.close();
  const db = openDb(file, MIGRATIONS.slice(0, 2));
  try {
    assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, USER_VERSION_BASE + 2);
    assert.deepEqual(
      db.prepare("SELECT name, kind FROM projects").all().map((r) => ({ ...r })),
      [{ name: "p", kind: null }],
    );
    // 値の一覧は CHECK にしない（種類を増やしても表を作り直さない）。空文字は「ない」と紛れるので断る
    db.prepare("UPDATE projects SET kind = 'common'").run();
    assert.throws(() => db.prepare("UPDATE projects SET kind = ''").run(), /CHECK constraint failed/);
  } finally {
    db.close();
  }
});

test("移行 v3: v2 の DB を開くとノートの外の画像の表（範囲・許可・覚え書き）が足され、プロジェクトを消すと一緒に消える", () => {
  const file = path.join(tempDir(), DB_FILE);
  const v2 = openDb(file, MIGRATIONS.slice(0, 2));
  v2.prepare("INSERT INTO projects (name, repo_path, provider, hue, position) VALUES ('p', '/tmp/p', 'claude', 0, 1)").run();
  v2.close();
  const db = openDb(file, MIGRATIONS);
  try {
    assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, USER_VERSION_BASE + 3);
    const id = (db.prepare("SELECT id FROM projects").get() as { id: number }).id;
    const scope = Number(db.prepare("INSERT INTO note_image_scopes (project_id, path) VALUES (?, 'a.md')").run(id).lastInsertRowid);
    db.prepare("INSERT INTO note_image_hosts (scope_id, host) VALUES (?, 'example.com')").run(scope);
    db.prepare("INSERT INTO note_image_cache (scope_id, key, host, content_type, size) VALUES (?, 'k', 'example.com', 'image/png', 3)").run(scope);
    assert.throws(() => db.prepare("INSERT INTO note_image_scopes (project_id, path) VALUES (?, '')").run(id), /CHECK constraint failed/);
    assert.throws(() => db.prepare("INSERT INTO note_image_scopes (project_id, path) VALUES (?, 'a.md')").run(id), /UNIQUE constraint failed/);
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    assert.deepEqual([count("note_image_scopes"), count("note_image_hosts"), count("note_image_cache")], [0, 0, 0]);
    // 範囲の ID は使い回さない（覚えた画像のフォルダ名なので）
    const next = Number(db.prepare("INSERT INTO projects (name, repo_path, provider, hue, position) VALUES ('B', '/tmp/b', 'claude', 0, 2) RETURNING id").get()!.id);
    assert.ok(Number(db.prepare("INSERT INTO note_image_scopes (project_id, path) VALUES (?, 'a.md')").run(next).lastInsertRowid) > scope);
  } finally {
    db.close();
  }
});
