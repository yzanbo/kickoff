import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { tempDir } from "../../testing/tempDir.js";
import { interpolate, parseEnvFile } from "./envFile.js";
import { candidatesFromCompose, publishedPort, type ComposeHosts } from "./fromCompose.js";
import { candidatesFromEnv } from "./fromEnv.js";
import { parsePrismaConfig, parsePrismaSchema } from "./fromPrisma.js";
import { guessEnvironment } from "./found.js";
import { scanProjectDbs, toImportCandidates } from "./index.js";

test("parseEnvFile: export・引用符（\" は \\n を読み、' はそのまま）・囲まない値のコメント・複数行・${VAR} の展開", () => {
  const vars = parseEnvFile(
    [
      "# コメント",
      "export A=1",
      'B="x\\ny" # c',
      "C='$A raw'",
      "D=post#gres # comment",
      "E=${A}-$B",
      'F="line1',
      'line2"',
      "  G = spaced  ",
      "not a line",
    ].join("\n"),
  );
  assert.equal(vars.get("A"), "1");
  assert.equal(vars.get("B"), "x\ny");
  assert.equal(vars.get("C"), "$A raw");
  assert.equal(vars.get("D"), "post#gres");
  assert.equal(vars.get("E"), "1-x\ny");
  assert.equal(vars.get("F"), "line1\nline2");
  assert.equal(vars.get("G"), "spaced");
  assert.equal(vars.size, 7);
});

test("interpolate: ${VAR:-既定}・${VAR-既定}・$$・知らない名前は空", () => {
  const env = new Map([
    ["X", "x"],
    ["EMPTY", ""],
  ]);
  const look = (n: string) => env.get(n);
  assert.equal(interpolate("${X}/${NONE:-d}/${EMPTY:-d}/${EMPTY-d}/$$X/$NONE.", look), "x/d/d//$X/.");
});

test("guessEnvironment: 名前の本番・ステージング → この Mac の中はローカル → 名前の開発 → 分からない外のホストは本番", () => {
  assert.equal(guessEnvironment(".env.production", "postgres", "localhost"), "production");
  assert.equal(guessEnvironment(".env.staging", "postgres", "db.example.com"), "staging");
  assert.equal(guessEnvironment(".env", "postgres", "127.0.0.1"), "local");
  assert.equal(guessEnvironment(".env", "sqlite", null), "local");
  assert.equal(guessEnvironment(".env.development", "mysql", "dev.example.com"), "dev");
  assert.equal(guessEnvironment(".env", "postgres", "db.example.com"), "production");
});

test("candidatesFromEnv: 接続の URL の名前と Laravel の DB_HOST などの組。パスワードは持つが SQLite の相対パスはプロジェクトフォルダから", () => {
  const vars = new Map([
    ["DATABASE_URL", "postgres://app:s3cret@db.example.com:5433/shop?sslmode=require"],
    ["REDIS_URL", "redis://localhost:6379"],
    ["SQLITE_URL", "sqlite:./data/app.db"],
    ["SHADOW_DATABASE_URL", ""],
    ["DB_CONNECTION", "pgsql"],
    ["DB_HOST", "127.0.0.1"],
    ["DB_DATABASE", "laravel"],
    ["DB_USERNAME", "sail"],
    ["DB_PASSWORD", "pw"],
  ]);
  const found = candidatesFromEnv(".env", vars);
  assert.deepEqual(
    found.map((f) => [f.key, f.engine, f.host, f.port, f.database, f.username, f.password, f.file_path, f.environment]),
    [
      ["env:.env:DATABASE_URL", "postgres", "db.example.com", 5433, "shop", "app", "s3cret", null, "production"],
      ["env:.env:SQLITE_URL", "sqlite", null, null, null, null, null, "data/app.db", "local"],
      ["env:.env:DB_CONNECTION", "postgres", "127.0.0.1", 5432, "laravel", "sail", "pw", null, "local"],
    ],
  );
  assert.deepEqual(found[0].ssl, { mode: "require", ca_path: null });
  assert.match(found[0].note ?? "", /本番として/);
  assert.equal(found[0].origin, ".env の DATABASE_URL");
  // Prisma が使う名前は飛ばす
  assert.equal(candidatesFromEnv(".env", vars, new Set(["DATABASE_URL"])).length, 2);
});

test("candidatesFromCompose: DB のイメージのサービスを localhost と外に出したポートで。${VAR} は .env から、外に出していなければ注意", () => {
  const doc = {
    services: {
      db: { image: "postgres:16", environment: { POSTGRES_USER: "${PGUSER:-app}", POSTGRES_PASSWORD: "${PGPASS}", POSTGRES_DB: "shop" }, ports: ["127.0.0.1:5433:5432"] },
      mysql: { image: "mysql:8", environment: ["MYSQL_ROOT_PASSWORD=root", "MYSQL_DATABASE=app"], container_name: "my-db" },
      web: { image: "node:22", ports: ["3000:3000"] },
      cache: { build: "." },
    },
  };
  const hosts: ComposeHosts = new Map();
  const found = candidatesFromCompose("compose.yaml", doc, new Map([["PGPASS", "pw"]]), hosts);
  assert.deepEqual(
    found.map((f) => [f.key, f.engine, f.host, f.port, f.database, f.username, f.password, f.environment, Boolean(f.note)]),
    [
      ["compose:compose.yaml:db", "postgres", "localhost", 5433, "shop", "app", "pw", "local", false],
      ["compose:compose.yaml:mysql", "mysql", "localhost", 3306, "app", "root", "root", "local", true],
    ],
  );
  assert.deepEqual([...hosts], [["db", 5433], ["mysql", null], ["my-db", null]]);
  assert.equal(publishedPort([{ target: 5432, published: "15432" }], 5432, () => undefined), 15432);
  assert.equal(publishedPort(["5432"], 5432, () => undefined), null);
});

test("Prisma: schema.prisma の provider と url、prisma.config.ts の schema と url をよくある形で読む", () => {
  assert.deepEqual(parsePrismaSchema('// x\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\nmodel A { id Int @id }'), {
    engine: "postgres",
    url: { env: "DATABASE_URL" },
  });
  assert.deepEqual(parsePrismaSchema('datasource db {\n provider = "sqlite"\n url = "file:./dev.db"\n}'), { engine: "sqlite", url: { literal: "file:./dev.db" } });
  assert.equal(parsePrismaSchema("model A { id Int @id }"), null);
  assert.deepEqual(parsePrismaConfig('export default defineConfig({ schema: "db/schema.prisma", datasource: { url: env("PG_URL") } })'), { schema: "db/schema.prisma", url: { env: "PG_URL" } });
  assert.deepEqual(parsePrismaConfig("export default { datasource: { url: process.env.DATABASE_URL } }"), { schema: null, url: { env: "DATABASE_URL" } });
});

const makeSqlite = (file: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE t (id INTEGER)");
  db.close();
};

test("scanProjectDbs: .env・compose・Prisma・SQLite のファイルを探し、compose のサービス名を読み替え、同じ接続は 1 つに。パスワードは画面へ出さない", async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, ".env"), "DATABASE_URL=file:./dev.db\nAPI_DB_URL=postgres://u:pw@db:5432/app\nPGPASS=pw\n");
  fs.writeFileSync(path.join(root, ".env.production"), "DATABASE_URL=postgres://u:x@prod.example.com/app\n");
  fs.writeFileSync(path.join(root, ".env.example"), "DATABASE_URL=postgres://user:pass@localhost/example\n");
  fs.writeFileSync(path.join(root, "compose.yaml"), 'services:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_USER: u\n      POSTGRES_PASSWORD: ${PGPASS}\n      POSTGRES_DB: app\n    ports:\n      - "15432:5432"\n');
  fs.mkdirSync(path.join(root, "prisma"));
  fs.writeFileSync(path.join(root, "prisma/schema.prisma"), 'datasource db {\n  provider = "sqlite"\n  url = env("DATABASE_URL")\n}\n');
  makeSqlite(path.join(root, "prisma/dev.db"));
  makeSqlite(path.join(root, "data/other.sqlite3"));
  makeSqlite(path.join(root, "node_modules/x/skip.db"));
  makeSqlite(path.join(root, "blocked/secret.db"));
  fs.writeFileSync(path.join(root, "data/not-sqlite.db"), "hello");

  const found = await scanProjectDbs(root, (abs) => !abs.includes(`${path.sep}blocked${path.sep}`));
  assert.deepEqual(
    found.map((f) => [f.key, f.engine, f.host, f.port, f.file_path, f.environment]),
    [
      ["prisma:prisma/schema.prisma", "sqlite", null, null, path.join("prisma", "dev.db"), "local"],
      ["env:.env:API_DB_URL", "postgres", "localhost", 15432, null, "local"],
      ["env:.env.production:DATABASE_URL", "postgres", "prod.example.com", 5432, null, "production"],
      ["file:data/other.sqlite3", "sqlite", null, null, path.join("data", "other.sqlite3"), "local"],
    ],
  );
  assert.match(found[1].note ?? "", /localhost:15432 に読み替え/);
  // compose の db は .env の URL と同じ接続なので出さない・prisma/dev.db もファイルの方は重ねない

  const shown = toImportCandidates(found, [{ id: 9, engine: "sqlite", host: null, port: null, database: null, file_path: "prisma/dev.db" } as never], root);
  assert.equal(shown[0].existing_id, 9);
  // 絶対パスで登録した接続も、リンクを解いた実体が同じなら登録済み（/tmp → /private/tmp など）
  const linked = path.join(tempDir(), "link");
  fs.symlinkSync(root, linked);
  const byLink = toImportCandidates(found, [{ id: 7, engine: "sqlite", host: null, port: null, database: null, file_path: path.join(linked, "prisma", "dev.db") } as never], root);
  assert.equal(byLink[0].existing_id, 7);
  assert.equal(shown[1].has_password, true);
  assert.equal(shown[3].has_password, false);
  assert.ok(shown.every((c) => !("password" in c)));
});
