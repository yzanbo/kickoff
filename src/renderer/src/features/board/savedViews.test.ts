import assert from "node:assert/strict";
import { test } from "node:test";
import { PROJECT_SAVED_VIEWS } from "@/lib/storageKeys";
import { activeView, addView, isNoopViewMove, moveView, parseSavedViews, parseViewState, projectViewState, removeView, renameView, replaceViewState, sameViewState, viewNameTaken, type BoardViewState, type SavedView } from "./savedViews";

const base: BoardViewState = { view: "board", lanes: "project", columns: "state", sort: { key: "active", dir: "desc" }, archive: "all" };
const view = (id: string, state: Partial<BoardViewState> = {}): SavedView => ({ id, name: `v${id}`, state: { ...base, ...state } });

test("parseViewState: 合う形だけ読み、合わない項目があれば捨てる", () => {
  assert.deepEqual(parseViewState(base), base);
  const { columns: _, ...noColumns } = base;
  assert.deepEqual(parseViewState(noColumns), noColumns);
  assert.equal(parseViewState({ ...base, view: "gallery" }), undefined);
  assert.equal(parseViewState({ ...base, sort: { key: "x", dir: "asc" } }), undefined);
  assert.deepEqual(
    parseSavedViews([
      { id: "1", name: "a", state: base },
      { id: "2", name: "b", state: { view: "nope" } },
    ]).map((v) => v.id),
    ["1"],
  );
});

test("sameViewState: 表示・段・列の分け方・アーカイブ・並び順を比べる", () => {
  assert.equal(sameViewState(base, { ...base }), true);
  assert.equal(sameViewState(base, { ...base, view: "list" }), false);
  assert.equal(sameViewState(base, { ...base, sort: { key: "title", dir: "asc" } }), false);
  assert.equal(sameViewState(base, { ...base, lanes: "none" }), false);
});

test("parseViewState: 前の版の表（table）のビューはリストとして読み、表で隠す列（hidden）は捨てる", () => {
  assert.deepEqual(parseViewState({ ...base, view: "table", hidden: ["created"] }), { ...base, view: "list" });
});

test("activeView・追加・名前の変更・上書き・削除", () => {
  const views = [view("1", { view: "list" }), view("2")];
  assert.equal(activeView(views, base)?.id, "2");
  assert.equal(activeView(views, { ...base, view: "feed" }), undefined);
  const added = addView(views, view("3", { view: "feed" }));
  assert.deepEqual(added.map((v) => v.id), ["1", "2", "3"]);
  assert.equal(renameView(added, "3", "フィード")[2].name, "フィード");
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

test("projectViewState: 列の分け方のない前の版のビューは状態として読み、ほかはそのまま", () => {
  const { columns: _, ...noColumns } = base;
  assert.deepEqual(projectViewState(noColumns), { ...base, columns: "state" });
  assert.deepEqual(projectViewState({ ...base, columns: "groups" }), { ...base, columns: "groups" });
  assert.deepEqual(projectViewState({ ...base, view: "list", columns: "none" }), { ...base, view: "list", columns: "none" });
});

test("moveView: target の前・後ろへ動かし、ないビューならそのまま", () => {
  const views = ["a", "b", "c", "d"].map((id) => view(id));
  const ids = (list: SavedView[]) => list.map((v) => v.id);
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

test("parseViewState: 表示項目（cardHidden）は知っている項目だけ読み、配列でなければそのビューを捨てる", () => {
  assert.deepEqual(parseViewState({ ...base, cardHidden: ["model", "gone", 3, "cost"] })?.cardHidden, ["model", "cost"]);
  assert.equal(parseViewState({ ...base, cardHidden: "model" }), undefined);
  assert.equal("cardHidden" in (parseViewState(base) ?? {}), false);
});

test("sameViewState: 表示項目は順によらず比べ、持たないビュー（前の版のもの）は比べない", () => {
  assert.equal(sameViewState({ ...base, cardHidden: ["cost", "model"] }, { ...base, cardHidden: ["model", "cost"] }), true);
  assert.equal(sameViewState({ ...base, cardHidden: ["model"] }, { ...base, cardHidden: [] }), false);
  assert.equal(sameViewState(base, { ...base, cardHidden: ["model"] }), true);
});

test("プロジェクトのボードの初めのビュー: グループボード・状態ボード・グループリストの順で、どれも読める", () => {
  const views = parseSavedViews(PROJECT_SAVED_VIEWS.initial);
  assert.deepEqual(
    views.map((v) => v.name),
    ["グループボード", "状態ボード", "グループリスト"],
  );
  assert.deepEqual(
    views.map((v) => [v.state.view, v.state.columns, v.state.lanes]),
    [
      ["board", "groups", "none"],
      ["board", "state", "none"],
      ["list", "state", "group"],
    ],
  );
  // すべて消したら [] を覚え、初めのビューに戻さない
  assert.equal(PROJECT_SAVED_VIEWS.encode([]), "[]");
});
