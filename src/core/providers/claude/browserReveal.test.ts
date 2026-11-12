import assert from "node:assert/strict";
import { test } from "node:test";
import type { RevealRequest } from "../../browser/control.js";
import { turnReveal } from "./browserReveal.js";

/** 表に出す頼みを覚え、answer の返事を返す偽物 */
function fake(answer: (tabId: number, request: RevealRequest) => boolean | Error = () => true) {
  const calls: [number, RevealRequest][] = [];
  const reveal = turnReveal(async (tabId, request) => {
    calls.push([tabId, request]);
    const result = answer(tabId, request);
    if (result instanceof Error) throw result;
    return result;
  });
  return { reveal, calls };
}

test("作業の初めにタブを使うと 1 回だけ表に出し、同じタブではもう頼まない", async () => {
  const { reveal, calls } = fake();
  await reveal.use(5);
  await reveal.use(5);
  await reveal.use(5);
  assert.deepEqual(calls, [[5, { after: null }]]);
});

test("別のタブに移ると、前に表に出したタブを添えて頼む（利用者がまだ見ているときだけ切り替える）", async () => {
  const { reveal, calls } = fake();
  await reveal.use(5);
  await reveal.use(7);
  await reveal.use(7);
  assert.deepEqual(calls, [
    [5, { after: null }],
    [7, { after: 5 }],
  ]);
});

test("表に出せなかったら（利用者が離れた）、その作業の間はもう頼まない", async () => {
  const { reveal, calls } = fake((tabId) => tabId === 5);
  await reveal.use(5);
  await reveal.use(7);
  await reveal.use(9);
  await reveal.use(5);
  assert.deepEqual(calls, [
    [5, { after: null }],
    [7, { after: 5 }],
  ]);
  assert.equal(reveal.request(), null);
});

test("background を頼まれたら、その作業の間は表に出さない（あとのツールで省いても）", async () => {
  const { reveal, calls } = fake();
  await reveal.use(5, true);
  await reveal.use(5);
  await reveal.use(7);
  assert.deepEqual(calls, []);
  assert.equal(reveal.request(), null);
});

test("新しいタブを開くときの頼みと、開いた結果の覚え方", () => {
  const { reveal } = fake();
  assert.deepEqual(reveal.request(), { after: null });
  reveal.settle(3, true);
  assert.deepEqual(reveal.request(), { after: 3 });
  reveal.settle(4, false);
  assert.equal(reveal.request(), null);
});

test("表に出すのに失敗しても投げず、その作業の間はもう頼まない", async () => {
  const { reveal, calls } = fake(() => new Error("画面が応答しません"));
  await reveal.use(5);
  await reveal.use(7);
  assert.equal(calls.length, 1);
});
