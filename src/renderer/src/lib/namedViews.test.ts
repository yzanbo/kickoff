import assert from "node:assert/strict";
import { test } from "node:test";
import { addView, isNoopViewMove, moveView, removeView, renameView, replaceViewState, viewNameTaken, type NamedView } from "./namedViews";

type View = NamedView<{ n: number }>;
const view = (id: string, n = 0): View => ({ id, name: `v${id}`, state: { n } });

test("追加・名前の変更・上書き・削除", () => {
  const views = [view("1"), view("2")];
  const added = addView(views, view("3"));
  assert.deepEqual(added.map((v) => v.id), ["1", "2", "3"]);
  assert.equal(renameView(added, "3", "フィード")[2].name, "フィード");
  assert.equal(replaceViewState(added, "1", { n: 5 })[0].state.n, 5);
  assert.deepEqual(removeView(added, "2").map((v) => v.id), ["1", "3"]);
});

test("viewNameTaken: 同じ一覧の同じ名前（前後の空白・全角半角・大文字小文字は区別しない）。名前を変えるビュー自身は除く", () => {
  const views = [view("1"), { ...view("2"), name: "Review" }];
  assert.equal(viewNameTaken(views, "v1"), true);
  assert.equal(viewNameTaken(views, " V1 "), true);
  assert.equal(viewNameTaken(views, "ｒｅｖｉｅｗ"), true);
  assert.equal(viewNameTaken(views, "v3"), false);
  assert.equal(viewNameTaken(views, "v1", "1"), false);
  assert.equal(viewNameTaken(views, "review", "1"), true);
});

test("moveView: target の前・後ろへ動かし、ないビューならそのまま", () => {
  const views = ["a", "b", "c", "d"].map((id) => view(id));
  const ids = (list: View[]) => list.map((v) => v.id);
  assert.deepEqual(ids(moveView(views, "a", "c", "after")), ["b", "c", "a", "d"]);
  assert.deepEqual(ids(moveView(views, "d", "a", "before")), ["d", "a", "b", "c"]);
  assert.deepEqual(ids(moveView(views, "b", "d", "before")), ["a", "c", "b", "d"]);
  assert.deepEqual(ids(moveView(views, "x", "a", "before")), ["a", "b", "c", "d"]);
  assert.deepEqual(ids(moveView(views, "a", "x", "after")), ["a", "b", "c", "d"]);
});

test("isNoopViewMove: 自分の上・すぐ前の後ろ・すぐ後ろの前は並びが変わらない", () => {
  const views = ["a", "b", "c"].map((id) => view(id));
  assert.equal(isNoopViewMove(views, "b", "b", "before"), true);
  assert.equal(isNoopViewMove(views, "b", "a", "after"), true);
  assert.equal(isNoopViewMove(views, "b", "c", "before"), true);
  assert.equal(isNoopViewMove(views, "b", "a", "before"), false);
  assert.equal(isNoopViewMove(views, "b", "c", "after"), false);
});
