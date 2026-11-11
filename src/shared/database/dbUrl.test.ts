import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDbUrl } from "./dbUrl";

test("parseDbUrl: PostgreSQL・MySQL の URL から欄を埋める（符号化を解き、ポートがなければ既定）", () => {
  assert.deepEqual(parseDbUrl("postgres://app%40x:p%2Fss@db.example.com:6543/my_db?sslmode=require"), {
    engine: "postgres",
    host: "db.example.com",
    port: 6543,
    database: "my_db",
    username: "app@x",
    password: "p/ss",
    file_path: null,
    ssl: { mode: "require", ca_path: null },
  });
  const mysql = parseDbUrl("mysql://root@localhost/shop")!;
  assert.equal(mysql.engine, "mysql");
  assert.equal(mysql.port, 3306);
  assert.equal(mysql.password, null);
  assert.equal(mysql.ssl, null);
  assert.equal(parseDbUrl("mariadb://u:p@h:3307/d")!.engine, "mysql");
  assert.deepEqual(parseDbUrl("postgresql://h/d?sslmode=verify-full&sslrootcert=/ca.pem")!.ssl, { mode: "verify", ca_path: "/ca.pem" });
  assert.equal(parseDbUrl("postgresql+asyncpg://h/d")!.engine, "postgres");
});

test("parseDbUrl: SQLite はファイルのパス、知らない形は null", () => {
  assert.equal(parseDbUrl("sqlite:///Users/me/app.db")!.file_path, "/Users/me/app.db");
  assert.equal(parseDbUrl("sqlite:db/dev.sqlite3")!.file_path, "db/dev.sqlite3");
  assert.equal(parseDbUrl("file:./prisma/dev.db")!.file_path, "./prisma/dev.db");
  assert.equal(parseDbUrl("https://example.com"), null);
  assert.equal(parseDbUrl("ただの文"), null);
});
