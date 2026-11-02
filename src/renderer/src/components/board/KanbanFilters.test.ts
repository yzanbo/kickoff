import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeArchiveFilter, encodeArchiveFilter, type ArchiveFilter } from "./KanbanFilters";

test("decodeArchiveFilter: 保存されている形式（\"1\" = すべて / \"0\" = アーカイブしていないもの / \"archived\" = アーカイブ済み）をそのまま読む", () => {
  // 何も保存していなければ「すべて」（今までと同じ初期値）
  assert.equal(decodeArchiveFilter(null), "all");
  assert.equal(decodeArchiveFilter("1"), "all");
  assert.equal(decodeArchiveFilter("0"), "active");
  assert.equal(decodeArchiveFilter("archived"), "archived");
  // 知らない値は「アーカイブしていないもの」
  assert.equal(decodeArchiveFilter("bogus"), "active");
});

test("encodeArchiveFilter: 保存する形式は \"1\" / \"0\" / \"archived\" のまま。読み直すと同じ値になる", () => {
  assert.equal(encodeArchiveFilter("all"), "1");
  assert.equal(encodeArchiveFilter("active"), "0");
  assert.equal(encodeArchiveFilter("archived"), "archived");
  for (const value of ["all", "active", "archived"] as ArchiveFilter[]) assert.equal(decodeArchiveFilter(encodeArchiveFilter(value)), value);
});
