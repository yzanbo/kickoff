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

test("移行 v3: v2 の DB を開くとノートの外の画像の表（note_image_hosts・note_image_cache）が足され、プロジェクトを消すと一緒に消える", () => {
  const file = path.join(tempDir(), DB_FILE);
  const v2 = openDb(file, MIGRATIONS.slice(0, 2));
  v2.prepare("INSERT INTO projects (name, repo_path, provider, hue, position) VALUES ('p', '/tmp/p', 'claude', 0, 1)").run();
  v2.close();
  const db = openDb(file, MIGRATIONS);
  try {
    assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, USER_VERSION_BASE + 3);
    const id = (db.prepare("SELECT id FROM projects").get() as { id: number }).id;
    db.prepare("INSERT INTO note_image_hosts (project_id, path, host) VALUES (?, 'a.md', 'example.com')").run(id);
    assert.throws(() => db.prepare("INSERT INTO note_image_hosts (project_id, path, host) VALUES (?, '', 'example.com')").run(id), /CHECK constraint failed/);
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM note_image_hosts").get() as { n: number }).n, 0);
  } finally {
    db.close();
  }
});
