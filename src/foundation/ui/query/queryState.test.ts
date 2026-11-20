import assert from "node:assert/strict";
import { test } from "vitest";
import { EMPTY_QUERY, queryView, replaceData, settleData, settleError, startFetch, type QueryState } from "./queryState";

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
