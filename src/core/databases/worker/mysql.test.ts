// MySQL の列の型の名前（mysql2 の型の番号と文字コードから）
import assert from "node:assert/strict";
import { test } from "node:test";
import mysql from "mysql2";
import { mysqlTypeName } from "./mysql.js";

const UTF8MB4 = 255;
const BINARY = 63;

test("型の番号を SQL の型の名前にする（DECIMAL・INT・VARCHAR は SQL の名前で）", () => {
  assert.equal(mysqlTypeName({ columnType: mysql.Types.NEWDECIMAL, characterSet: BINARY }), "decimal");
  assert.equal(mysqlTypeName({ columnType: mysql.Types.LONG, characterSet: BINARY }), "int");
  assert.equal(mysqlTypeName({ columnType: mysql.Types.VAR_STRING, characterSet: UTF8MB4 }), "varchar");
  assert.equal(mysqlTypeName({ columnType: mysql.Types.DATETIME, characterSet: BINARY }), "datetime");
});

test("TEXT の列は BLOB の番号で届くので、文字コードがバイナリでなければ text にする", () => {
  assert.equal(mysqlTypeName({ columnType: mysql.Types.BLOB, characterSet: UTF8MB4 }), "text");
  assert.equal(mysqlTypeName({ columnType: mysql.Types.LONG_BLOB, characterSet: UTF8MB4 }), "longtext");
  assert.equal(mysqlTypeName({ columnType: mysql.Types.BLOB, characterSet: BINARY }), "blob");
  assert.equal(mysqlTypeName({ columnType: mysql.Types.MEDIUM_BLOB, characterSet: BINARY }), "mediumblob");
});

test("知らない番号は null", () => {
  assert.equal(mysqlTypeName({ columnType: 9999 }), null);
});
