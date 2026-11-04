import assert from "node:assert/strict";
import { test } from "node:test";
import { archiveMatches, linkedArchiveFilter } from "./archiveFilter";

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
