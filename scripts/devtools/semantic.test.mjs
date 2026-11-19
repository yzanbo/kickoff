import assert from "node:assert/strict";
import { test } from "vitest";
import { diffSemantic, formatSemantic, formatSemanticDiff } from "./semantic.mjs";

const item = (role, name, depth = 0, extra = {}) => ({ role, name, depth, visible: true, ...extra });
const record = (items) => ({ hash: "#/", theme: "dark", size: [1200, 800], count: items.length, items });

const base = [item("navigation", "サイドバー"), item("link", "alpha", 1, { data: { projectId: "1" } }), item("link", "beta", 1, { data: { projectId: "2" } }), item("button", "設定")];

test("同じ並びなら違いがない", () => {
  const result = diffSemantic(record(base), record(structuredClone(base)));
  assert.deepEqual(result, { onlyA: [], onlyB: [], changed: [], same: true });
});

test("足した物・消した物を、並びの最長共通部分の外として出す", () => {
  const after = [base[0], base[1], item("link", "gamma", 1), base[2], base[3]];
  const added = diffSemantic(record(base), record(after));
  assert.deepEqual([added.onlyA, added.onlyB, added.changed], [[], [2], []]);
  const removed = diffSemantic(record(after), record(base));
  assert.deepEqual([removed.onlyA, removed.onlyB, removed.changed], [[2], [], []]);
});

test("名札が同じで、見えるか・押せるか・選ばれているかが違う物は「変わった」", () => {
  const after = [base[0], { ...base[1], state: ["selected=true"] }, { ...base[2], visible: false }, { ...base[3], disabled: true }];
  const result = diffSemantic(record(base), record(after));
  assert.deepEqual(result.changed, [
    { a: 1, b: 1 },
    { a: 2, b: 2 },
    { a: 3, b: 3 },
  ]);
  assert.deepEqual([result.onlyA, result.onlyB, result.same], [[], [], false]);
});

test("同じ隙間で役割と深さの同じ物は、名前が変わった「変わった」として組にする", () => {
  const after = [base[0], item("link", "alpha（改名）", 1, { data: { projectId: "1" } }), base[2], item("heading", "見出し"), base[3]];
  const result = diffSemantic(record(base), record(after));
  assert.deepEqual(result.changed, [{ a: 1, b: 1 }]);
  assert.deepEqual([result.onlyA, result.onlyB], [[], [3]]);
});

test("深さが変わった物は組にせず、前だけ・後だけにする", () => {
  const after = [base[0], { ...base[1], depth: 2 }, base[2], base[3]];
  const result = diffSemantic(record(base), record(after));
  assert.deepEqual([result.onlyA, result.onlyB, result.changed], [[1], [1], []]);
});

test("記録は 1 物 1 行の JSON で、読み戻すと同じ", () => {
  const text = formatSemantic(record(base));
  assert.equal(text.split("\n").length, base.length + 3);
  assert.deepEqual(JSON.parse(text), record(base));
  assert.equal(formatSemantic(record([])), '{"hash":"#/","theme":"dark","size":[1200,800],"count":0,"items":[\n\n]}\n');
  assert.deepEqual(JSON.parse(formatSemantic(record([]))).items, []);
});

test("違いを人が読む行にする（前だけ -・後だけ +・変わった ~。limit 行まで）", () => {
  const after = [base[0], { ...base[1], state: ["selected=true"] }, base[3], item("button", "閉じる")];
  const a = record(base);
  const b = record(after);
  const text = formatSemanticDiff(a, b, diffSemantic(a, b));
  assert.match(text, /前だけ 1 \/ 後だけ 1 \/ 変わった 1/);
  assert.match(text, /^~ {3}link "alpha" \{"projectId":"1"\}\n {2}→ link "alpha" \{"projectId":"1"\} \[selected=true\]$/m);
  assert.match(text, /^- {3}link "beta"/m);
  assert.match(text, /^\+ button "閉じる"$/m);
  assert.match(formatSemanticDiff(a, b, diffSemantic(a, b), 1), /…ほか 2 件$/);
});
