import assert from "node:assert/strict";
import { test } from "node:test";
import { dangerReason, isReadOnlyStatement, splitStatements, statementAt, writeConfirmation } from "./sqlStatements";

const texts = (sql: string, engine: Parameters<typeof splitStatements>[1] = "postgres") => splitStatements(sql, engine).map((s) => s.text);

test("splitStatements: ; で分け、文字列・識別子・コメントの中の ; は数えない。空の文は除く", () => {
  assert.deepEqual(texts("select 1; select 2;\n\n  ;"), ["select 1", "select 2"]);
  assert.deepEqual(texts("select ';' as a; select \"x;y\" from t"), ["select ';' as a", 'select "x;y" from t']);
  assert.deepEqual(texts("select 1 -- a;b\n; /* c; */ select 2"), ["select 1 -- a;b", "/* c; */ select 2"]);
  assert.deepEqual(texts("-- だけ\n;  /* だけ */"), []);
  // '' のエスケープ
  assert.deepEqual(texts("select 'it''s;'; select 3"), ["select 'it''s;'", "select 3"]);
});

test("splitStatements: PostgreSQL のドル記号の文字列、MySQL の \\ と ` と #、SQLite の []", () => {
  assert.deepEqual(texts("create function f() returns int as $$ begin return 1; end; $$ language plpgsql; select 1"), [
    "create function f() returns int as $$ begin return 1; end; $$ language plpgsql",
    "select 1",
  ]);
  assert.deepEqual(texts("select $tag$a;b$tag$; select 2"), ["select $tag$a;b$tag$", "select 2"]);
  assert.deepEqual(texts("select 'a\\';b'; select `c;d` # e;f\n; select 1", "mysql"), ["select 'a\\';b'", "select `c;d` # e;f", "select 1"]);
  assert.deepEqual(texts("select [a;b] from t; select 1", "sqlite"), ["select [a;b] from t", "select 1"]);
});

test("splitStatements: SQLite・MySQL のトリガーの BEGIN … END の中の ; では分けない", () => {
  const sqlite = "create trigger t after insert on a begin insert into b values (1); update c set x = case when 1 then 2 end; end; select 1";
  assert.deepEqual(texts(sqlite, "sqlite"), [
    "create trigger t after insert on a begin insert into b values (1); update c set x = case when 1 then 2 end; end",
    "select 1",
  ]);
  const mysql = "CREATE TRIGGER t BEFORE INSERT ON a FOR EACH ROW BEGIN IF NEW.x > 0 THEN SET NEW.y = IF(1, 2, 3); END IF; END; SELECT 1";
  assert.deepEqual(texts(mysql, "mysql"), ["CREATE TRIGGER t BEFORE INSERT ON a FOR EACH ROW BEGIN IF NEW.x > 0 THEN SET NEW.y = IF(1, 2, 3); END IF; END", "SELECT 1"]);
  // トリガーでない BEGIN は区切る
  assert.deepEqual(texts("begin; insert into a values (1); commit", "sqlite"), ["begin", "insert into a values (1)", "commit"]);
});

test("splitStatements: 位置は元の SQL の中の位置", () => {
  const sql = "  select 1 ;\nselect 2";
  const [a, b] = splitStatements(sql, "sqlite");
  assert.equal(sql.slice(a.start, a.end), "select 1");
  assert.equal(sql.slice(b.start, b.end), "select 2");
});

test("statementAt: カーソルのある文、文の間なら直前の文、最初より前なら最初の文", () => {
  const sql = "  select 1;\n\nselect 2;  ";
  const statements = splitStatements(sql, "sqlite");
  assert.equal(statementAt(statements, 0)?.text, "select 1");
  assert.equal(statementAt(statements, 5)?.text, "select 1");
  assert.equal(statementAt(statements, 12)?.text, "select 1");
  assert.equal(statementAt(statements, sql.indexOf("select 2") + 3)?.text, "select 2");
  assert.equal(statementAt(statements, sql.length)?.text, "select 2");
  assert.equal(statementAt([], 0), null);
});

test("isReadOnlyStatement: 読むだけの文", () => {
  for (const sql of [
    "select * from t",
    "  -- コメント\n SELECT 1",
    "(select 1) union (select 2)",
    "with a as (select 1) select * from a",
    "explain select 1",
    "explain analyze select 1",
    "show tables",
    "describe t",
    "values (1)",
    "begin",
    "commit",
    "rollback",
    "select 'insert into' as a",
  ])
    assert.equal(isReadOnlyStatement(sql, "postgres"), true, sql);
  for (const sql of ["pragma table_info(t)", "pragma main.table_info(t)", "pragma journal_mode", "pragma foreign_key_list('t')"]) assert.equal(isReadOnlyStatement(sql, "sqlite"), true, sql);
});

test("isReadOnlyStatement: 書く文・分からない文", () => {
  for (const sql of [
    "insert into t values (1)",
    "update t set a = 1",
    "delete from t",
    "drop table t",
    "create table t (a int)",
    "select * into t2 from t",
    "select * from t for update",
    "with a as (delete from t returning *) select * from a",
    "explain analyze delete from t",
    "set session characteristics as transaction read write",
    "start transaction read write",
    "vacuum",
    "call p()",
    "grant select on t to u",
  ])
    assert.equal(isReadOnlyStatement(sql, "postgres"), false, sql);
  for (const sql of ["pragma foreign_keys = off", "pragma journal_mode(wal)", "pragma optimize", "attach database 'x' as y"]) assert.equal(isReadOnlyStatement(sql, "sqlite"), false, sql);
  assert.equal(isReadOnlyStatement("pragma table_info(t)", "postgres"), false);
});

test("dangerReason: DROP・TRUNCATE・ALTER・WHERE のない UPDATE / DELETE・判定できない文は理由、読む文・ふつうの書く文は null", () => {
  const pg = (sql: string) => dangerReason(sql, "postgres");
  assert.equal(pg("select * from users"), null);
  assert.equal(pg("insert into t values (1)"), null);
  assert.equal(pg("update t set a = 1 where id = 2"), null);
  assert.equal(pg("delete from t where id = 2"), null);
  assert.equal(pg("create table t (id int)"), null);
  assert.equal(pg("set search_path = app"), null);
  assert.match(pg("DROP TABLE users") ?? "", /DROP/);
  assert.match(pg("truncate users") ?? "", /TRUNCATE/);
  assert.match(pg("alter table users add column x int") ?? "", /ALTER/);
  assert.match(pg("update t set a = 1") ?? "", /WHERE のない UPDATE/);
  assert.match(pg("delete from t") ?? "", /WHERE のない DELETE/);
  // 括弧の中（副問い合わせ）の WHERE は数えない
  assert.match(pg("update t set a = (select b from u where u.id = 1)") ?? "", /WHERE のない UPDATE/);
  // WITH の中の書く文・コメントの中の WHERE
  assert.match(pg("with x as (select 1) delete from t -- where id = 1") ?? "", /WHERE のない DELETE/);
  assert.equal(pg("with x as (select 1) delete from t where id in (select * from x)"), null);
  assert.match(pg("grant select on t to bob") ?? "", /判定できない文（GRANT）/);
  assert.match(pg("vacuum") ?? "", /判定できない文（VACUUM）/);
  assert.equal(dangerReason("replace into t values (1)", "mysql"), null);
});

test("writeConfirmation: 読む文だけなら確かめず、dangerous は危険な文があるとき・all は書く文があれば・env_name は書く文があれば名前を打たせる", () => {
  const read = ["select 1", "show tables"];
  const plain = ["select 1", "insert into t values (1)"];
  const danger = ["insert into t values (1)", "drop table t"];
  assert.equal(writeConfirmation("all", read, "mysql").kind, "none");
  assert.equal(writeConfirmation("env_name", read, "mysql").kind, "none");
  assert.equal(writeConfirmation("dangerous", plain, "mysql").kind, "none");
  assert.equal(writeConfirmation("all", plain, "mysql").kind, "confirm");
  assert.equal(writeConfirmation("env_name", plain, "mysql").kind, "env_name");
  assert.deepEqual(writeConfirmation("dangerous", danger, "mysql"), { kind: "confirm", dangers: [{ index: 2, reason: "DROP（消す）" }] });
});
