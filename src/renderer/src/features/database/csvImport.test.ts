import assert from "node:assert/strict";
import { test } from "node:test";
import { detectDelimiter, mapCsvRows, parseDelimited } from "./csvImport";

test("detectDelimiter: 1 行目に多い区切り（囲みの中は数えない）", () => {
  assert.equal(detectDelimiter("a\tb\tc\n1,2\t3"), "\t");
  assert.equal(detectDelimiter('"a;b;c",d\n'), ",");
  assert.equal(detectDelimiter("a;b;c"), ";");
  assert.equal(detectDelimiter("abc"), ",");
});

test("parseDelimited: 囲み・\"\"・囲みの中の改行・CRLF・BOM・終わりの改行", () => {
  assert.deepEqual(parseDelimited('﻿id,name\r\n1,"O""Neil, Jr."\r\n2,"a\nb"\n', ","), [
    ["id", "name"],
    ["1", 'O"Neil, Jr.'],
    ["2", "a\nb"],
  ]);
  assert.deepEqual(parseDelimited("a\t\tc\n\nx", "\t"), [["a", "", "c"], [""], ["x"]]);
  assert.deepEqual(parseDelimited("", ","), []);
});

test("mapCsvRows: 見出しで列に当てる（大文字・小文字を見ない）・ない見出し・空は NULL・空の行は飛ばす", () => {
  const table = [["ID", " Name ", "extra"], ["1", "", "x"], ["", "", ""], ["2", "b"]];
  assert.deepEqual(mapCsvRows(table, ["id", "name"], true, true), {
    rows: [{ id: "1", name: null }, { id: "2", name: "b" }],
    mapping: ["id", "name", null],
    unknown: ["extra"],
  });
  assert.deepEqual(mapCsvRows(table.slice(1), ["id", "name"], false, false).rows, [{ id: "1", name: "" }, { id: "2", name: "b" }]);
});
