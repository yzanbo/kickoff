import assert from "node:assert/strict";
import { test } from "vitest";
import { EMPTY_QUERY, errorText, queryView, replaceData, seedData, settleData, settleError, startFetch, type QueryState } from "./queryState";

const settled = <T>(key: string, data: T): QueryState<T> => settleData(startFetch(EMPTY_QUERY as QueryState<T>, key), key, data);
const view = <T>(state: QueryState<T>, key: string | null, keepPrevious = false) => queryView(state, key, { enabled: true, keepPrevious });

test("settleData: 新しいキーの結果は、そのまま覚えて取りに行っている印を外す", () => {
  const state = settled("a", [1]);
  assert.deepEqual(state, { key: "a", data: [1], error: undefined, loaded: true, fetching: null });
});

test("settleData: 同じキーで中身も同じ（same）なら、前の値のまま（描き直さない）", () => {
  const first = settled("a", [1]);
  const same = (p: number[], n: number[]) => p.join() === n.join();
  assert.equal(settleData(startFetch(first, "a"), "a", [1], same).data, first.data);
  assert.equal(settleData(first, "a", [1], same), first);
  assert.notEqual(settleData(first, "a", [2], same).data, first.data);
  // 比べ方がなければ置き換える
  assert.notEqual(settleData(first, "a", [1]).data, first.data);
});

test("queryView: いまのキーの結果だけを出し、別のキーのものは読み込み中にする（keepPrevious なら前の値を出したまま）", () => {
  const state = settled("a", [1]);
  assert.deepEqual(view(state, "a"), { data: [1], error: undefined, loading: false, loaded: true, stale: false });
  assert.deepEqual(view(state, "b"), { data: undefined, error: undefined, loading: true, loaded: false, stale: false });
  assert.deepEqual(view(state, "b", true), { data: [1], error: undefined, loading: true, loaded: false, stale: true });
  assert.deepEqual(view(state, null), { data: undefined, error: undefined, loading: false, loaded: false, stale: false });
  // 取り直している間も前の値を出す
  assert.deepEqual(view(startFetch(state, "a"), "a"), { data: [1], error: undefined, loading: true, loaded: true, stale: false });
});

test("settleError: 失敗は Error のまま。keepPrevious なら前の値を残し、成功したら失敗は消える", () => {
  const state = settled("a", [1]);
  const error = new Error("読めません");
  assert.deepEqual(settleError(state, "a", error, false), { key: "a", data: undefined, error, loaded: true, fetching: null });
  const kept = settleError(state, "b", error, true);
  assert.deepEqual([kept.data, kept.error, kept.key], [[1], error, "b"]);
  assert.equal(settleData(kept, "b", [2]).error, undefined);
});

test("replaceData: 関数はいまのキーの値があるときだけ当て、値はそのまま入れる", () => {
  const state = settled("a", [1]);
  assert.deepEqual(replaceData(state, "a", (prev) => [...prev, 2]).data, [1, 2]);
  assert.equal(replaceData(state, "b", (prev) => [...prev, 2]), state);
  assert.equal(replaceData(EMPTY_QUERY as QueryState<number[]>, "a", (prev) => prev).data, undefined);
  assert.deepEqual(replaceData(EMPTY_QUERY as QueryState<number[]>, "a", [3]).data, [3]);
});

test("errorText: 失敗の文（失敗していなければ undefined）", () => {
  assert.equal(errorText(new Error("読めません")), "読めません");
  assert.equal(errorText(undefined), undefined);
});

test("settleData・settleError: ほかのキーを取りに行っている間に届いた古い答えは捨てる（GitHub の絞り込みを素早く 3 回変えたとき）", () => {
  const shown = settled("a", [1]);
  const fetchingC = startFetch(startFetch(startFetch(shown, "b"), "c"), "c");
  assert.equal(settleData(fetchingC, "b", [2]), fetchingC);
  assert.equal(settleError(fetchingC, "b", new Error("x"), true), fetchingC);
  // いまのキーの答えは入る
  assert.deepEqual(settleData(fetchingC, "c", [3]).data, [3]);
});

test("seedData: まだ値のないキーを取りに行っている間だけ、つなぎの値を出す（届いた印は付けない）", () => {
  const fetching = startFetch(EMPTY_QUERY as QueryState<number[]>, "a");
  const seeded = seedData(fetching, "a", [0]);
  assert.deepEqual(view(seeded, "a"), { data: [0], error: undefined, loading: true, loaded: false, stale: false });
  // 答えが届いたら置き換わり、そのあとに届いたつなぎは使わない
  const settledA = settleData(seeded, "a", [1]);
  assert.deepEqual(settledA.data, [1]);
  assert.equal(seedData(startFetch(settledA, "a"), "a", [0]).data, settledA.data);
  // 取りに行っていないキー（ほかへ移った）のつなぎも使わない
  assert.equal(seedData(startFetch(settledA, "b"), "a", [0]).data, settledA.data);
});
