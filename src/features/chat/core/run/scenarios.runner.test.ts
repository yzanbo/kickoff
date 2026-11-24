// チャットの実行の振る舞いの表（筋書き）を、組み立てたコアに HTTP の口から流して比べる（表は testing/scenarios.ts、流し方は testing/scenarioDriver.ts）。
// 直していない不具合の行（known）は正しい振る舞いを書き、落ちることを test.fails で確かめる（直すのは別の fix）
import assert from "node:assert/strict";
import { test } from "vitest";
import { SCENARIOS } from "./testing/scenarios";
import { runScenario } from "./testing/scenarioDriver";

test("表は S01〜S49 の筋書きを 1 つずつ持ち、どれも 8 章の番号を持つ", () => {
  const ids = SCENARIOS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (let n = 1; n <= 49; n++) assert.ok(ids.includes(`S${String(n).padStart(2, "0")}`), `S${n} がない`);
  assert.ok(SCENARIOS.every((s) => s.behavior >= 1 && s.behavior <= 38));
  assert.deepEqual(
    SCENARIOS.filter((s) => s.known).map((s) => [s.id, s.known]),
    [],
  );
});

for (const s of SCENARIOS) {
  const name = `${s.id}（8 章の ${s.behavior}）${s.name}`;
  if (s.known) test.fails(`${name}【いまは ${s.known} で落ちる】`, () => runScenario(s, { timeoutMs: 800 }));
  else test(name, () => runScenario(s));
}
