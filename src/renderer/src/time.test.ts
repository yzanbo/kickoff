import assert from "node:assert/strict";
import { test } from "node:test";
import { formatClock, formatDayTime, relativeTime, resetIn, resetInShort, shortRelativeTime } from "./time";

test("履歴の日時: 今日・昨日は時刻つき、今年は月日、去年より前は年月日", () => {
  const now = new Date(2026, 10, 1, 23, 0);
  assert.equal(formatDayTime(new Date(2026, 10, 1, 22, 6).toISOString(), now), "今日 22:06");
  assert.equal(formatDayTime(new Date(2026, 9, 31, 21, 25).toISOString(), now), "昨日 21:25");
  assert.equal(formatDayTime(new Date(2026, 9, 25, 22, 1).toISOString(), now), "10月25日 22:01");
  assert.equal(formatDayTime(new Date(2025, 2, 1, 9, 0).toISOString(), now), "2025/3/1");
});

test("サイドバー向けの短い経過時間（「前」は付けない）", () => {
  const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
  assert.equal(shortRelativeTime(ago(10)), "今");
  assert.equal(shortRelativeTime(ago(5 * 60)), "5分");
  assert.equal(shortRelativeTime(ago(23 * 3600)), "23時間");
  assert.equal(shortRelativeTime(ago(3 * 86400)), "3日");
  assert.match(shortRelativeTime(ago(10 * 86400)), /^\d{1,2}\/\d{1,2}$/);
});

test("relativeTime: たった今・分前・時間前、1 日より前は日付", () => {
  const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();
  assert.equal(relativeTime(ago(5)), "たった今");
  assert.equal(relativeTime(ago(5 * 60 + 10)), "5分前");
  assert.equal(relativeTime(ago(3 * 3600 + 10)), "3時間前");
  assert.match(relativeTime(ago(3 * 86400)), /^\d{1,2}\/\d{1,2}$/);
});

test("resetIn / resetInShort: 分・時間・日の単位で丸める。null なら null", () => {
  const now = Date.parse("2026-11-03T00:00:00Z");
  const after = (min: number) => new Date(now + min * 60_000).toISOString();
  assert.equal(resetInShort(after(12), now), "12分後");
  assert.equal(resetInShort(after(5 * 60 + 20), now), "5時間後");
  assert.equal(resetInShort(after(3 * 24 * 60), now), "3日後");
  // 過ぎていれば 0 分
  assert.equal(resetInShort(after(-30), now), "0分後");
  assert.equal(resetIn(after(12), now), "12分後にリセット");
  assert.equal(resetIn(null, now), null);
});

test("formatClock: 時刻だけ（2 桁）", () => {
  assert.equal(formatClock(new Date(2026, 0, 1, 14, 5).toISOString()), "14:05");
  assert.equal(formatClock(new Date(2026, 0, 1, 9, 0).toISOString()), "09:00");
});
