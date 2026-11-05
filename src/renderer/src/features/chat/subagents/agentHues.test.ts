import assert from "node:assert/strict";
import { test } from "node:test";
import { agentHues } from "./agentHues";

const keys = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `t${i}` }));

test("agentHues: 起動した順に、続けて起動したものどうしが似ない色を回し、10 件を超えたら初めから", () => {
  const hues = agentHues(keys(12));
  assert.equal(new Set([...hues.values()].slice(0, 10)).size, 10);
  assert.equal(hues.get("t10"), hues.get("t0"));
  assert.equal(hues.get("t11"), hues.get("t1"));
});

test("agentHues: あとから起動したものが足されても、前のものの色は変わらない", () => {
  const before = agentHues(keys(3));
  const after = agentHues(keys(5));
  for (const [key, hue] of before) assert.equal(after.get(key), hue);
});
