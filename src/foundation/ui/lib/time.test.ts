import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { formatClock, formatDayTime, formatDuration, formatFullDateTime, formatFullStamp, formatMessageTime, formatStamp, formatStampRange, formatStampRangeWithRunTime, formatStampRunTime, formatReset, relativeTime, resetDateFormats, resetInShort, ZONE_CHECK_MS } from "./time";

test("履歴の日時: 今日・昨日は時刻つき、今年は月日、去年より前は年月日", () => {
  const now = new Date(2026, 10, 1, 23, 0);
  assert.equal(formatDayTime(new Date(2026, 10, 1, 22, 6).toISOString(), now), "今日 22:06");
  assert.equal(formatDayTime(new Date(2026, 9, 31, 21, 25).toISOString(), now), "昨日 21:25");
  assert.equal(formatDayTime(new Date(2026, 9, 25, 22, 1).toISOString(), now), "10月25日 22:01");
  assert.equal(formatDayTime(new Date(2025, 2, 1, 9, 0).toISOString(), now), "2025/3/1");
});

test("relativeTime の short: サイドバー向けの短い経過時間（「前」は付けない）", () => {
  const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
  assert.equal(relativeTime(ago(10), { style: "short" }), "今");
  assert.equal(relativeTime(ago(5 * 60), { style: "short" }), "5分");
  assert.equal(relativeTime(ago(23 * 3600), { style: "short" }), "23時間");
  assert.equal(relativeTime(ago(3 * 86400), { style: "short" }), "3日");
  assert.match(relativeTime(ago(10 * 86400), { style: "short" }), /^\d{1,2}\/\d{1,2}$/);
});

test("relativeTime: たった今・分前・時間前、1 日より前は日付", () => {
  const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();
  assert.equal(relativeTime(ago(5)), "たった今");
  assert.equal(relativeTime(ago(5 * 60 + 10)), "5分前");
  assert.equal(relativeTime(ago(3 * 3600 + 10)), "3時間前");
  assert.match(relativeTime(ago(3 * 86400)), /^\d{1,2}\/\d{1,2}$/);
});

test("resetInShort: 分・時間・日の単位で丸める。null なら null", () => {
  const now = Date.parse("2026-11-03T00:00:00Z");
  const after = (min: number) => new Date(now + min * 60_000).toISOString();
  assert.equal(resetInShort(after(12), now), "12分後");
  assert.equal(resetInShort(after(5 * 60 + 20), now), "5時間後");
  assert.equal(resetInShort(after(3 * 24 * 60), now), "3日後");
  // 過ぎていれば 0 分
  assert.equal(resetInShort(after(-30), now), "0分後");
  assert.equal(resetInShort(null, now), null);
});

test("formatClock: 時刻だけ（2 桁）", () => {
  assert.equal(formatClock(new Date(2026, 0, 1, 14, 5).toISOString()), "14:05");
  assert.equal(formatClock(new Date(2026, 0, 1, 9, 0).toISOString()), "09:00");
});

test("formatDuration: 秒・分秒・時間分（ちょうどのときは下の単位を付けない）", () => {
  assert.equal(formatDuration(0), "0秒");
  assert.equal(formatDuration(8_900), "8秒");
  assert.equal(formatDuration(60_000), "1分");
  assert.equal(formatDuration(83_000), "1分23秒");
  assert.equal(formatDuration(3_600_000), "1時間");
  assert.equal(formatDuration(3_900_000), "1時間5分");
  assert.equal(formatDuration(-5), "0秒");
});

test("発言の時刻: 今日は時刻、7 日以内は曜日と時刻、それより前は日付", () => {
  const now = new Date(2026, 10, 3, 23, 0); // 火曜
  assert.equal(formatMessageTime(new Date(2026, 10, 3, 9, 5).toISOString(), now), "09:05");
  assert.equal(formatMessageTime(new Date(2026, 10, 2, 21, 25).toISOString(), now), "月曜 21:25");
  assert.equal(formatMessageTime(new Date(2026, 9, 28, 8, 0).toISOString(), now), "水曜 08:00");
  assert.equal(formatMessageTime(new Date(2026, 9, 27, 8, 0).toISOString(), now), "10月27日");
  assert.equal(formatMessageTime(new Date(2025, 2, 1, 9, 0).toISOString(), now), "2025/3/1");
  assert.equal(formatFullDateTime(new Date(2026, 10, 3, 9, 5).toISOString()), "2026/11/3 09:05");
});

test("処理の時刻: 今日は時刻だけ（秒まで）、別の日は日付も、去年より前は年も", () => {
  const now = new Date(2026, 10, 5, 12, 0);
  assert.equal(formatStamp(new Date(2026, 10, 5, 8, 34, 12).toISOString(), now), "08:34:12");
  assert.equal(formatStamp(new Date(2026, 10, 4, 23, 58, 1).toISOString(), now), "11/4 23:58:01");
  assert.equal(formatStamp(new Date(2025, 2, 1, 9, 0, 5).toISOString(), now), "2025/3/1 09:00:05");
  assert.equal(formatFullStamp(new Date(2026, 10, 5, 8, 34, 12).toISOString()), "2026/11/5 08:34:12");
});

test("処理の時間の範囲: 同じ日なら終わりは時刻だけ、日をまたいだら終わりにも日付", () => {
  const now = new Date(2026, 10, 5, 12, 0);
  const at = (d: number, h: number, m: number, s: number) => new Date(2026, 10, d, h, m, s).toISOString();
  assert.equal(formatStampRange(at(5, 8, 34, 12), at(5, 8, 36, 40), now), "08:34:12 – 08:36:40");
  assert.equal(formatStampRange(at(3, 8, 34, 12), at(3, 9, 0, 0), now), "11/3 08:34:12 – 09:00:00");
  assert.equal(formatStampRange(at(4, 23, 58, 1), at(5, 0, 3, 12), now), "11/4 23:58:01 – 11/5 00:03:12");
  assert.equal(formatStampRange(at(5, 8, 34, 12), at(5, 8, 34, 12), now), "08:34:12");
});

test("formatDuration の full: いちばん大きい単位から下はすべて出す", () => {
  assert.equal(formatDuration(0, { full: true }), "0秒");
  assert.equal(formatDuration(8_900, { full: true }), "8秒");
  assert.equal(formatDuration(60_000, { full: true }), "1分0秒");
  assert.equal(formatDuration(148_000, { full: true }), "2分28秒");
  assert.equal(formatDuration(3_600_000, { full: true }), "1時間0分0秒");
  assert.equal(formatDuration(3_725_000, { full: true }), "1時間2分5秒");
  assert.equal(formatDuration(-5, { full: true }), "0秒");
});

test("終わった処理の範囲と実行時間: 時刻が 1 つだけのときは添えない", () => {
  const now = new Date(2026, 10, 5, 12, 0);
  const at = (d: number, h: number, m: number, s: number) => new Date(2026, 10, d, h, m, s).toISOString();
  assert.equal(formatStampRangeWithRunTime(at(5, 12, 6, 47), at(5, 12, 6, 55), now), "12:06:47 – 12:06:55 · 8秒");
  assert.equal(formatStampRangeWithRunTime(at(4, 23, 58, 1), at(5, 1, 0, 13), now), "11/4 23:58:01 – 11/5 01:00:13 · 1時間2分12秒");
  assert.equal(formatStampRangeWithRunTime(at(5, 8, 34, 12), at(5, 8, 34, 12), now), "08:34:12");
});

test("終わった処理の実行時間は、並べた開始と終了の時刻の差（秒より下を切り捨てた時刻どうし）", () => {
  const now = new Date(2026, 10, 5, 14, 0);
  const at = (s: number, ms: number) => new Date(2026, 10, 5, 13, 27, s, ms).toISOString();
  // 実際は 0.6 秒でも、時刻が 37 と 38 なら 1秒（「0秒」だと並べた時刻と合わない）
  assert.equal(formatStampRangeWithRunTime(at(37, 800), at(38, 400), now), "13:27:37 – 13:27:38 · 1秒");
  // 実際は 1.8 秒でも、時刻が 37 と 38 なら 1秒
  assert.equal(formatStampRunTime(at(37, 100), at(38, 900)), "1秒");
  // 同じ秒の中なら、時刻は 1 つで実行時間は添えない
  assert.equal(formatStampRangeWithRunTime(at(37, 100), at(37, 900), now), "13:27:37");
});

test("relativeTime の ago: GitLens と同じく、日付にせずに何日前・何か月前・何年前まで言う", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const ago = (sec: number) => new Date(now - sec * 1000).toISOString();
  assert.equal(relativeTime(ago(10), { style: "ago", now }), "たった今");
  assert.equal(relativeTime(ago(5 * 60), { style: "ago", now }), "5分前");
  assert.equal(relativeTime(ago(3 * 3600), { style: "ago", now }), "3時間前");
  assert.equal(relativeTime(ago(5 * 86400), { style: "ago", now }), "5日前");
  assert.equal(relativeTime(ago(65 * 86400), { style: "ago", now }), "2か月前");
  assert.equal(relativeTime(ago(800 * 86400), { style: "ago", now }), "2年前");
});

/** 1 年分を 259 分（37 分 × 7）おき（日・時・分がずれていく間隔。テストを軽くするため 37 分おきから広げた）と、月末・年末・0 時・12 時・23:59 の日時 */
function sampleDates(year: number): Date[] {
  const out: Date[] = [];
  for (let t = new Date(year, 0, 1).getTime(); t < new Date(year + 1, 0, 1).getTime(); t += 259 * 60_000) out.push(new Date(t));
  for (const [m, d, h, min] of [[0, 31, 0, 0], [1, 28, 12, 0], [5, 30, 23, 59], [11, 31, 23, 59], [11, 31, 0, 0], [2, 1, 12, 30]]) out.push(new Date(year, m, d, h, min, 7));
  return out;
}

/** 作り置きの書式で出した文字が、元の toLocale*String と 1 文字も変わらない */
function assertSameAsToLocale(dates: Date[]) {
  const longBefore = Date.parse("2000-01-01T00:00:00Z");
  for (const d of dates) {
    const iso = d.toISOString();
    assert.equal(formatClock(iso), d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }), iso);
    const seconds = d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    assert.equal(formatFullStamp(iso), `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${seconds}`, iso);
    const weekday = d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
    assert.equal(formatReset(iso, longBefore), `${weekday} ${d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} にリセット`, iso);
  }
}

test("時刻の整形の作り置き: 書式ごとに、元の toLocale*String と同じ文字になる", () => {
  assertSameAsToLocale(sampleDates(2026));
  // 1 日より前は月日（relativeTime の long と short）
  for (const d of sampleDates(2025)) {
    const monthDay = d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
    assert.equal(relativeTime(d.toISOString()), monthDay);
    assert.equal(relativeTime(d.toISOString(), { style: "short" }), monthDay);
  }
});

test("時刻の整形の作り置き: 不正な日時は toLocale*String と同じく Invalid Date", () => {
  assert.equal(formatClock("x"), new Date("x").toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
  assert.equal(formatClock("x"), "Invalid Date");
});

test("時刻の整形の作り置き: 時間帯が変わったら作り直し、夏時間のある時間帯でも同じ文字になる", () => {
  // 作り置きはモジュールに残るので、ほかのファイルのテストに New York の書式を残さない
  onTestFinished(resetDateFormats);
  onTestFinished(() => {
    vi.useRealTimers();
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
  formatClock(new Date().toISOString()); // いまの時間帯で作り置く
  vi.stubEnv("TZ", "America/New_York");
  vi.advanceTimersByTime(ZONE_CHECK_MS);
  // 夏時間の切り替え（3 月・11 月）の前後
  const around = (iso: string) => Array.from({ length: 48 }, (_, i) => new Date(Date.parse(iso) + (i - 24) * 30 * 60_000));
  assertSameAsToLocale([...around("2026-03-08T07:00:00Z"), ...around("2026-11-01T06:00:00Z")]);
  assert.equal(formatClock("2026-03-08T07:30:00Z"), "03:30");
});
