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

test("agentHues: サブエージェントの中で起動したもの（孫・ひ孫も）は、いちばん外側の祖先と同じ色。外側の色の順には数えない", () => {
  const hues = agentHues([
    { key: "a" },
    { key: "a1", parentKey: "a" },
    { key: "b" },
    { key: "a1x", parentKey: "a1" },
    { key: "orphan", parentKey: "gone" },
  ]);
  const solo = agentHues(keys(3));
  assert.equal(hues.get("a1"), hues.get("a"));
  assert.equal(hues.get("a1x"), hues.get("a"));
  // 入れ子は色の順を進めないので、b は 2 つ目の色・親が一覧にないものは 3 つ目の色
  assert.equal(hues.get("b"), solo.get("t1"));
  assert.equal(hues.get("orphan"), solo.get("t2"));
});

test("agentHues: あとから起動したものが足されても、前のものの色は変わらない", () => {
  const before = agentHues(keys(3));
  const after = agentHues(keys(5));
  for (const [key, hue] of before) assert.equal(after.get(key), hue);
});
