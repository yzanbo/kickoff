// 接続の形の表: ファイルの DB は SQLite だけ
import assert from "node:assert/strict";
import { test } from "vitest";
import { DB_ENGINES } from "./types";
import { isFileDb } from "./connectionShape";

test("isFileDb: SQLite だけがファイルの DB", () => {
  assert.deepEqual(DB_ENGINES.filter(isFileDb), ["sqlite"]);
});
