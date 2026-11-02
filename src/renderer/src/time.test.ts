import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDayTime, shortRelativeTime } from "./time";

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
