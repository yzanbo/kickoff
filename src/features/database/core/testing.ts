// DB クライアントのテストの補助: 組み立てたコア（createTestCore）と同じ DB・秘密の値の上に、組み立てと同じ形のサービスと金庫を組む。
// 機能の公開の口は null なので、ルートが持つ実体の中（開いているセッション・その場で入れたパスワード）は読まない（それはサービスの単体のテストで見る）
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { NewDbConnectionBody } from "@shared/database/api";
import { afterTest } from "@/foundation/core/testing/afterTest";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { inProcessWorker } from "@/features/database/testing/inProcessWorker";
import type { DbServiceParts } from "./parts";
import { DbSecretVault, type SecretCipher } from "./secrets";
import { createDatabaseService } from "./service";
import { DbWorkerClient } from "./workerClient";

/** サービスを組むのに使うテストのコアの部品（createTestCore の返す物が満たす） */
interface DbTestCore {
  store: DbServiceParts["store"] & { secrets: { get(key: string): string | null } };
  dbFake: { dataDir: string; appDataRoot: string };
}

/** 同じ秘密の値の店を読む金庫（保存したパスワードの暗号化・復号を確かめる。cipher はコアに渡したものと同じにする） */
export function dbVaultOf(core: Pick<DbTestCore, "store">, cipher: SecretCipher | null = null) {
  return new DbSecretVault(core.store, cipher);
}

/**
 * 同じ DB の上に、組み立てと同じ形のサービスを組む（AI のツールなど、HTTP を通らない口を確かめる）。
 * ワーカーは同じプロセスで動かし、テストが終わったら止める。client を渡せば、そのワーカーの呼び手を使う
 */
export function databaseServiceOf(core: DbTestCore, opts: { secretCipher?: SecretCipher | null; client?: DbWorkerClient } = {}) {
  const client = opts.client ?? new DbWorkerClient(inProcessWorker);
  const databases = createDatabaseService({ store: core.store, client, vault: dbVaultOf(core, opts.secretCipher), dataDir: core.dbFake.dataDir, appDataRoot: core.dbFake.appDataRoot, exportRoot: tempDir() });
  afterTest(() => databases.close());
  return databases;
}

/** プロジェクトのフォルダに SQLite のファイルを作る（users と、users を指す posts） */
export function makeSqlite(dir: string, name = "app.db") {
  const file = path.join(dir, name);
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, avatar BLOB);
    CREATE INDEX idx_users_name ON users(name);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, title TEXT);
    CREATE VIEW user_names AS SELECT name FROM users;
    INSERT INTO users (name, avatar) VALUES ('b', x'0102'), ('a', NULL), ('c', NULL);
    INSERT INTO posts (user_id, title) VALUES (1, 'hello');
  `);
  db.close();
  return file;
}

/** SQLite の接続を作る本文（patch で替える） */
export const sqliteBody = (patch: Partial<NewDbConnectionBody> = {}): NewDbConnectionBody => ({
  name: "ローカルの DB",
  engine: "sqlite",
  environment: "local",
  // つなぎ先は SQLite のファイルだけ
  host: null, port: null, database: null, username: null,
  file_path: "app.db",
  ssl: null,
  read_only: false,
  ai_access: "allow",
  ...patch,
});
