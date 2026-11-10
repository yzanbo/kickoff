import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions, hookOutput, needsFetch, shouldNotify } from "./check-claude-update.mjs";

const at = (s) => Date.parse(s);

test("版を数字の段ごとに比べる", () => {
  assert.ok(compareVersions("2.1.323", "2.1.322") > 0);
  assert.ok(compareVersions("2.10.0", "2.9.9") > 0);
  assert.equal(compareVersions("2.1.322", "2.1.322"), 0);
  assert.ok(compareVersions("2.1.321", "2.1.322") < 0);
});

test("npm に聞き直すのは、覚えがないか 24 時間たったときだけ", () => {
  const now = at("2026-11-10T12:00:00Z");
  assert.equal(needsFetch({}, now), true);
  assert.equal(needsFetch({ latest: "2.1.322", checked_at: "2026-11-10T01:00:00Z" }, now), false);
  assert.equal(needsFetch({ latest: "2.1.322", checked_at: "2026-11-09T11:59:00Z" }, now), true);
});

test("失敗したあとは 1 時間あけて聞き直す", () => {
  const now = at("2026-11-10T12:00:00Z");
  assert.equal(needsFetch({ failed_at: "2026-11-10T11:30:00Z" }, now), false);
  assert.equal(needsFetch({ failed_at: "2026-11-10T10:59:00Z" }, now), true);
});

test("手元より新しい版があるときだけ知らせる", () => {
  const now = at("2026-11-10T12:00:00Z");
  assert.equal(shouldNotify({ local: "2.1.322", latest: "2.1.323", now, hook: true }), true);
  assert.equal(shouldNotify({ local: "2.1.322", latest: "2.1.322", now, hook: true }), false);
  assert.equal(shouldNotify({ local: "2.1.323", latest: "2.1.322", now, hook: true }), false);
  assert.equal(shouldNotify({ local: "2.1.322", latest: undefined, now, hook: true }), false);
});

test("フックでは同じ版を 1 日 1 回まで。翌日・別の版ならまた知らせる。ターミナルではいつも知らせる", () => {
  const notified = { version: "2.1.323", at: new Date(2026, 10, 10, 9, 0).toISOString() };
  const later = new Date(2026, 10, 10, 9, 30).getTime();
  const nextDay = new Date(2026, 10, 11, 9, 0).getTime();
  assert.equal(shouldNotify({ local: "2.1.322", latest: "2.1.323", notified, now: later, hook: true }), false);
  assert.equal(shouldNotify({ local: "2.1.322", latest: "2.1.323", notified, now: nextDay, hook: true }), true);
  assert.equal(shouldNotify({ local: "2.1.322", latest: "2.1.324", notified, now: later, hook: true }), true);
  assert.equal(shouldNotify({ local: "2.1.322", latest: "2.1.323", notified, now: later, hook: false }), true);
});

test("フックの出力は SessionStart の additionalContext", () => {
  const out = JSON.parse(hookOutput("2.1.322", "2.1.323"));
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(out.hookSpecificOutput.additionalContext, /2\.1\.322 → 最新 2\.1\.323/);
});
