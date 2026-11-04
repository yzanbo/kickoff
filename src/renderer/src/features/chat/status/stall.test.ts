import assert from "node:assert/strict";
import { test } from "node:test";
import { activityOf, activityText, latestOf, STALL_MS, stalledAgents } from "./stall";

const now = new Date("2026-11-03T12:00:00Z").getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();

test("動きの様子: 1 分までは動いている、それから最後の動き、10 分で動きがない", () => {
  assert.deepEqual(activityOf(ago(30_000), now), { level: "active", minutes: 0 });
  assert.equal(activityText(activityOf(ago(30_000), now)), "");
  assert.equal(activityText(activityOf(ago(3 * 60_000 + 5_000), now)), "最後の動き 3 分前");
  assert.equal(activityText(activityOf(ago(STALL_MS + 2 * 60_000), now), "Bash"), "12 分動きがありません（Bash の結果待ち）");
  // 時刻がなければ動いているとみなす
  assert.equal(activityOf(undefined, now).level, "active");
});

test("動きの様子: いちばん新しい時刻と、長く動きのない実行中のサブエージェント", () => {
  assert.equal(latestOf(ago(5_000), undefined, ago(1_000), null), ago(1_000));
  assert.equal(latestOf(), undefined);
  const entries = [
    { key: "a", description: "動いている", status: "running" as const, lastActivityAt: ago(60_000) },
    { key: "b", description: "止まっている", status: "running" as const, lastActivityAt: ago(STALL_MS + 1) },
    { key: "c", description: "終わった", status: "completed" as const, lastActivityAt: ago(STALL_MS * 2) },
  ];
  assert.deepEqual(stalledAgents(entries, now).map((s) => s.key), ["b"]);
});
