import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

/** 残すバックアップの数（新しいものから） */
const KEEP = 5;
const BACKUP_NAME = /^kickoff-v\d+-\d{8}-\d{6}\.db$/;

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/**
 * スキーマの版を上げる前・古い系統（v17）から変換する前に、いまのデータベースを同じフォルダの backups/ に写す
 * （kickoff-v<いまの版>-<日時>.db。呼ぶのは dbOpen.ts）。新しい版をインストールして初めて起動したときに、
 * マイグレーション・変換や新しい版の不具合でデータを戻せるように。
 * 写すのは VACUUM INTO（WAL の書きかけも含めて崩れない）。新しいものから KEEP 件だけ残す
 */
export function backupBeforeMigration(db: DatabaseSync, file: string, fromVersion: number, now = new Date()): string {
  const dir = path.join(path.dirname(file), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `kickoff-v${fromVersion}-${stamp(now)}.db`);
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
  const old = fs
    .readdirSync(dir)
    .filter((name) => BACKUP_NAME.test(name))
    .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name))
    .slice(KEEP);
  for (const { name } of old) fs.rmSync(path.join(dir, name));
  return target;
}
