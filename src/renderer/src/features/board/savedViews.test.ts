import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_PROJECTS_SAVED_VIEWS, PROJECT_SAVED_VIEWS } from "@/lib/storageKeys";
import { activeView, parseSavedViews, parseViewState, projectViewState, sameViewState, type BoardViewState, type SavedView } from "./savedViews";

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

test("sameViewState: 列の分け方を持たないビュー（前の版のプロジェクトのボードのもの）は列の分け方を比べない", () => {
  const { columns: _, ...old } = base;
  assert.equal(sameViewState(old, { ...base, columns: "groups" }), true);
  assert.equal(sameViewState({ ...base, columns: "state" }, { ...base, columns: "groupsState" }), false);
});

test("parseViewState: 前の版のリストの行（compact）が入ったビューも読み、その値は捨てる", () => {
  assert.deepEqual(parseViewState({ ...base, compact: true }), base);
  assert.deepEqual(parseViewState({ ...base, compact: undefined }), base);
});

test("activeView: いまの見え方に合う、いちばん前のビュー", () => {
  const views = [view("1", { view: "list" }), view("2")];
  assert.equal(activeView(views, base)?.id, "2");
  assert.equal(activeView(views, { ...base, view: "feed" }), undefined);
});

test("projectViewState: 列の分け方のない前の版のビューは状態として読み、ほかはそのまま", () => {
  const { columns: _, ...noColumns } = base;
  assert.deepEqual(projectViewState(noColumns), { ...base, columns: "state" });
  assert.deepEqual(projectViewState({ ...base, columns: "groups" }), { ...base, columns: "groups" });
  assert.deepEqual(projectViewState({ ...base, view: "list", columns: "none" }), { ...base, view: "list", columns: "none" });
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

test("全プロジェクトのボードの初めのビュー: プロジェクト別グループボード・プロジェクト別リストの順で、どれも読める", () => {
  const views = parseSavedViews(ALL_PROJECTS_SAVED_VIEWS.initial);
  assert.deepEqual(
    views.map((v) => [v.name, v.state.view, v.state.columns, v.state.lanes]),
    [
      ["プロジェクト別グループボード", "board", "groups", "project"],
      ["プロジェクト別リスト", "list", "none", "project"],
    ],
  );
  assert.equal(ALL_PROJECTS_SAVED_VIEWS.encode([]), "[]");
});
