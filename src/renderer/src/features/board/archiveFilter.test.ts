import assert from "node:assert/strict";
import { test } from "node:test";
import { archiveMatches, decodeArchiveFilter, encodeArchiveFilter, linkedArchiveFilter, type ArchiveFilter } from "./archiveFilter";

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

test("archiveMatches: すべて = どちらも出す / 未アーカイブ = アーカイブ済みを出さない / アーカイブ済み = 未アーカイブを出さない", () => {
  const active = { archived_at: null };
  const archived = { archived_at: "2026-01-01T00:00:00Z" };
  assert.deepEqual([archiveMatches(active, "all"), archiveMatches(archived, "all")], [true, true]);
  assert.deepEqual([archiveMatches(active, "active"), archiveMatches(archived, "active")], [true, false]);
  assert.deepEqual([archiveMatches(active, "archived"), archiveMatches(archived, "archived")], [false, true]);
});

test("linkedArchiveFilter: サイドバーと共通の設定で隠していれば未アーカイブ、出していればボードで覚えた「アーカイブ済みだけ」かすべて", () => {
  assert.equal(linkedArchiveFilter(false, "all"), "active");
  assert.equal(linkedArchiveFilter(false, "archived"), "active");
  assert.equal(linkedArchiveFilter(true, "archived"), "archived");
  assert.equal(linkedArchiveFilter(true, "active"), "all");
  assert.equal(linkedArchiveFilter(true, "all"), "all");
});
