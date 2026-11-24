// 本物の DB サーバーの確かめ（drivers.dbtest.ts）のエンジンごとの接続の形と、確かめに使う表
import type { DbEngine } from "@shared/database/types";

interface EngineCase {
  label: string;
  key: string;
  engine: DbEngine;
  user: string;
  database: string;
  sleep: string;
  terminate: string;
}

export const CASES: EngineCase[] = [
  { label: "PostgreSQL", key: "PG", engine: "postgres", user: "postgres", database: "postgres", sleep: "SELECT pg_sleep(20)", terminate: "SELECT pg_terminate_backend(pg_backend_pid())" },
  { label: "MySQL", key: "MYSQL", engine: "mysql", user: "root", database: "kickoff", sleep: "SELECT SLEEP(20)", terminate: "KILL CONNECTION_ID()" },
  { label: "MariaDB", key: "MARIADB", engine: "mysql", user: "root", database: "kickoff", sleep: "SELECT SLEEP(20)", terminate: "KILL CONNECTION_ID()" },
];

/** 絞り込みなし */
export const ALL = { filters: [], where: null };

/** 0〜9 の行（MySQL・MariaDB で連番を作る） */
const DIGITS = `(SELECT 0 AS n ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `UNION ALL SELECT ${n}`).join(" ")})`;
export const series = (max: number) => `SELECT a.n + b.n * 10 + c.n * 100 + d.n * 1000 + 1 AS n FROM ${DIGITS} a, ${DIGITS} b, ${DIGITS} c, ${DIGITS} d WHERE a.n + b.n * 10 + c.n * 100 + d.n * 1000 + 1 <= ${max}`;

/** 確かめに使う表（users 1500 行・posts 40 行・ビュー 1 つ） */
export function fixture(engine: DbEngine): string[] {
  const drop = ["DROP VIEW IF EXISTS user_posts", "DROP TABLE IF EXISTS posts", "DROP TABLE IF EXISTS users"];
  if (engine === "postgres") {
    return [
      ...drop,
      "CREATE TABLE users (id bigserial PRIMARY KEY, name text NOT NULL, email text, created_at timestamp DEFAULT '2026-01-02 03:04:05', avatar bytea, big bigint)",
      "COMMENT ON TABLE users IS '利用者'",
      "CREATE TABLE posts (id serial PRIMARY KEY, user_id bigint REFERENCES users (id) ON DELETE CASCADE, title text)",
      "CREATE INDEX posts_user ON posts (user_id)",
      "CREATE VIEW user_posts AS SELECT u.name, p.title FROM users u JOIN posts p ON p.user_id = u.id",
      "INSERT INTO users (name, email, avatar, big) SELECT 'user' || g, CASE WHEN g % 7 = 0 THEN NULL ELSE 'u' || g || '@ex.com' END, '\\x01020304'::bytea, 9007199254740993 FROM generate_series(1, 1500) g",
      "INSERT INTO posts (user_id, title) SELECT (g % 10) + 1, 'title ' || g FROM generate_series(1, 40) g",
      "ANALYZE users",
      "DROP FUNCTION IF EXISTS add_one(integer)",
      "DROP FUNCTION IF EXISTS add_one(text)",
      "DROP TYPE IF EXISTS mood",
      "CREATE FUNCTION add_one(x integer) RETURNS integer LANGUAGE sql AS $$ SELECT x + 1 $$",
      "CREATE FUNCTION add_one(x text) RETURNS text LANGUAGE sql AS $$ SELECT x || '1' $$",
      "COMMENT ON FUNCTION add_one(integer) IS '1 を足す'",
      "CREATE TYPE mood AS ENUM ('sad', 'ok', 'it''s fine')",
    ];
  }
  return [
    ...drop,
    "CREATE TABLE users (id bigint AUTO_INCREMENT PRIMARY KEY, name varchar(100) NOT NULL, email varchar(200), created_at datetime DEFAULT '2026-01-02 03:04:05', avatar blob, big bigint) COMMENT = '利用者'",
    "CREATE TABLE posts (id int AUTO_INCREMENT PRIMARY KEY, user_id bigint, title varchar(200), INDEX posts_user (user_id), CONSTRAINT posts_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE)",
    "CREATE VIEW user_posts AS SELECT u.name, p.title FROM users u JOIN posts p ON p.user_id = u.id",
    `INSERT INTO users (name, email, avatar, big) SELECT CONCAT('user', s.n), IF(s.n % 7 = 0, NULL, CONCAT('u', s.n, '@ex.com')), X'01020304', 9007199254740993 FROM (${series(1500)}) s ORDER BY s.n`,
    `INSERT INTO posts (user_id, title) SELECT (s.n % 10) + 1, CONCAT('title ', s.n) FROM (${series(40)}) s ORDER BY s.n`,
    "DROP FUNCTION IF EXISTS add_one",
    "DROP PROCEDURE IF EXISTS count_posts",
    "CREATE FUNCTION add_one(x INT) RETURNS INT DETERMINISTIC NO SQL COMMENT '1 を足す' RETURN x + 1",
    "CREATE PROCEDURE count_posts(IN uid BIGINT, OUT n INT) READS SQL DATA SELECT COUNT(*) INTO n FROM posts WHERE user_id = uid",
  ];
}
