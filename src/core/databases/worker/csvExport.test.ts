// AI の SQL の CSV の書き出し: セルの書き方と、頭の行を超えたときだけファイルにすべての行を書くこと（SQLite のドライバで）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { tempDir } from "../../testing/tempDir.js";
import { csvCell, exportQuery } from "./csvExport.js";
import { openSqlite } from "./sqlite.js";

test("csvCell: NULL は空・バイナリは \\x と 16 進のすべて・区切りや改行や頭の空白を含むものだけ囲む", () => {
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
  assert.equal(csvCell(12), "12");
  assert.equal(csvCell(12345678901234567890n), "12345678901234567890");
  assert.equal(csvCell(new Uint8Array(20).fill(0xab)), `\\x${"ab".repeat(20)}`);
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell('say "hi", ok'), '"say ""hi"", ok"');
  assert.equal(csvCell("a\nb"), '"a\nb"');
  assert.equal(csvCell(" lead"), '" lead"');
  assert.equal(csvCell(true), "true");
});

function sqliteWith(rows: number) {
  const dir = tempDir();
  const file = path.join(dir, "t.db");
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE t (id INTEGER, name TEXT, data BLOB)");
  const insert = db.prepare("INSERT INTO t VALUES (?, ?, ?)");
  for (let i = 1; i <= rows; i++) insert.run(i, i === 2 ? "x,y" : `n${i}`, i === 1 ? new Uint8Array([1, 2]) : null);
  db.close();
  return { dir, driver: openSqlite({ engine: "sqlite", host: null, port: null, database: null, username: null, password: null, file, ssl: null, read_only: true }) };
}

test("exportQuery: 頭の行で収まればファイルを作らず、超えたらすべての行（1 行目は列の名前）を書き出す", async () => {
  const small = sqliteWith(3);
  const out = path.join(small.dir, "out", "small.csv");
  const few = await exportQuery(small.driver, "SELECT id, name FROM t ORDER BY id", out, 5);
  assert.equal(few.file, null);
  assert.equal(few.total_rows, 3);
  assert.deepEqual(few.rows, [
    [1, "n1"],
    [2, "x,y"],
    [3, "n3"],
  ]);
  assert.equal(fs.existsSync(out), false);
  await small.driver.close();

  const big = sqliteWith(250);
  const file = path.join(big.dir, "out", "big.csv");
  const many = await exportQuery(big.driver, "SELECT * FROM t ORDER BY id", file, 100);
  assert.equal(many.file, file);
  assert.equal(many.total_rows, 250);
  assert.equal(many.rows.length, 100);
  assert.deepEqual(
    many.columns.map((c) => c.name),
    ["id", "name", "data"],
  );
  const lines = fs.readFileSync(file, "utf8").trimEnd().split("\n");
  assert.equal(lines.length, 251);
  assert.deepEqual(lines.slice(0, 4), ["id,name,data", "1,n1,\\x0102", '2,"x,y",', "3,n3,"]);
  assert.equal(lines[250], "250,n250,");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  await big.driver.close();
});

test("exportQuery: 失敗したら書きかけのファイルを残さない", async () => {
  const { dir, driver } = sqliteWith(150);
  const file = path.join(dir, "fail.csv");
  // 121 行目を読むときに失敗する文（壊れた JSON を読む。100 行を超えてファイルを作ったあと）
  await assert.rejects(exportQuery(driver, "SELECT id, CASE WHEN id > 120 THEN json_extract('{bad', '$') END FROM t ORDER BY id", file, 100), /JSON/);
  assert.equal(fs.existsSync(file), false);
  await driver.close();
});
