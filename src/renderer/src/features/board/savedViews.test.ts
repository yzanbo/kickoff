import assert from "node:assert/strict";
import { test } from "node:test";
import { activeView, addView, parseSavedViews, parseViewState, removeView, renameView, replaceViewState, sameViewState, viewNameTaken, type BoardViewState, type SavedView } from "./savedViews";

const base: BoardViewState = { view: "board", lanes: "project", columns: "state", sort: { key: "active", dir: "desc" }, hidden: ["created"], archive: "all" };
const view = (id: string, state: Partial<BoardViewState> = {}): SavedView => ({ id, name: `v${id}`, state: { ...base, ...state } });

test("parseViewState: 合う形だけ読み、合わない項目があれば捨てる", () => {
  assert.deepEqual(parseViewState(base), base);
  const { columns: _, ...noColumns } = base;
  assert.deepEqual(parseViewState(noColumns), noColumns);
  assert.equal(parseViewState({ ...base, view: "gallery" }), undefined);
  assert.equal(parseViewState({ ...base, sort: { key: "x", dir: "asc" } }), undefined);
  assert.equal(parseViewState({ ...base, hidden: "created" }), undefined);
  assert.deepEqual(
    parseSavedViews([
      { id: "1", name: "a", state: base },
      { id: "2", name: "b", state: { view: "nope" } },
    ]).map((v) => v.id),
    ["1"],
  );
});

test("sameViewState: 表の列は表のときだけ比べる", () => {
  assert.equal(sameViewState(base, { ...base, hidden: [] }), true);
  assert.equal(sameViewState({ ...base, view: "table" }, { ...base, view: "table", hidden: [] }), false);
  assert.equal(sameViewState({ ...base, view: "table", hidden: ["a", "b"] }, { ...base, view: "table", hidden: ["b", "a"] }), true);
  assert.equal(sameViewState(base, { ...base, sort: { key: "title", dir: "asc" } }), false);
  assert.equal(sameViewState(base, { ...base, lanes: "none" }), false);
});

test("activeView・追加・名前の変更・上書き・削除", () => {
  const views = [view("1", { view: "list" }), view("2")];
  assert.equal(activeView(views, base)?.id, "2");
  assert.equal(activeView(views, { ...base, view: "table" }), undefined);
  const added = addView(views, view("3", { view: "table" }));
  assert.deepEqual(added.map((v) => v.id), ["1", "2", "3"]);
  assert.equal(renameView(added, "3", "表")[2].name, "表");
  assert.equal(replaceViewState(added, "1", base)[0].state.view, "board");
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

test("sameViewState: 列の分け方を持たないビュー（前の版のプロジェクトのボードのもの）は列の分け方を比べない", () => {
  const { columns: _, ...old } = base;
  assert.equal(sameViewState(old, { ...base, columns: "groups" }), true);
  assert.equal(sameViewState({ ...base, columns: "state" }, { ...base, columns: "groupsState" }), false);
});

test("parseViewState: 前の版のリストの行（compact）が入ったビューも読み、その値は捨てる", () => {
  assert.deepEqual(parseViewState({ ...base, compact: true }), base);
  assert.deepEqual(parseViewState({ ...base, compact: undefined }), base);
});
