import assert from "node:assert/strict";
import { test } from "vitest";
import { storage } from "./storage";
import {
  activeSidebarView,
  describeSidebarView,
  newSidebarViewName,
  parseSidebarViews,
  parseSidebarViewState,
  patchOf,
  sameSidebarViewState,
  type SidebarView,
  type SidebarViewState,
} from "./viewFields";

const base: SidebarViewState = {
  layout: "stack",
  projectOrder: "recent",
  projectCompact: false,
  showArchivedProjects: false,
  grouping: "group",
  chatOrder: "recent",
  chatCompact: false,
  showArchivedChats: false,
  waitingOn: false,
  waitingScope: "top",
  waitingOrder: "project",
};
const view = (id: string, state: Partial<SidebarViewState> = {}): SidebarView => ({ id, name: `v${id}`, state: { ...base, ...state } });

test("parseSidebarViewState: 合う形だけ読み、知らない値・足りない項目があれば捨てる", () => {
  assert.deepEqual(parseSidebarViewState({ ...base, extra: 1 }), base);
  assert.equal(parseSidebarViewState({ ...base, layout: "grid" }), undefined);
  assert.equal(parseSidebarViewState({ ...base, chatCompact: "1" }), undefined);
  const { waitingOrder: _, ...missing } = base;
  assert.equal(parseSidebarViewState(missing), undefined);
  assert.equal(parseSidebarViewState(null), undefined);
});

test("sameSidebarViewState: 要対応がオフどうしなら、出し方 × 並べ方は比べない", () => {
  assert.equal(sameSidebarViewState(base, { ...base, waitingScope: "only", waitingOrder: "status" }), true);
  const on = { ...base, waitingOn: true };
  assert.equal(sameSidebarViewState(on, { ...on, waitingScope: "only" }), false);
  assert.equal(sameSidebarViewState(on, { ...on, waitingOrder: "status" }), false);
  // プロジェクト内の上には並べ方を選べないので比べない
  assert.equal(sameSidebarViewState({ ...on, waitingScope: "project" }, { ...on, waitingScope: "project", waitingOrder: "status" }), true);
  assert.equal(sameSidebarViewState(base, { ...base, chatCompact: true }), false);
});

test("activeSidebarView: いまの見え方に合う、いちばん前のビュー", () => {
  const views = [view("1", { layout: "rail" }), view("2"), view("3")];
  assert.equal(activeSidebarView(views, base)?.id, "2");
  assert.equal(activeSidebarView(views, { ...base, grouping: "none" }), undefined);
});

test("newSidebarViewName: 同じ名前のない番号", () => {
  assert.equal(newSidebarViewName([]), "ビュー 1");
  assert.equal(newSidebarViewName([{ ...view("1"), name: "ビュー 1" }, { ...view("2"), name: "ビュー 3" }]), "ビュー 2");
});

test("初めのビュー: 標準・コンパクト・要対応の順で、どれも読め、利用者が示した形", () => {
  const views = parseSidebarViews(storage.settings.savedViews.initial);
  assert.deepEqual(views.map((v) => v.name), ["標準", "コンパクト", "要対応"]);
  const [standard, compact, waiting] = views;
  assert.deepEqual(standard.state, { ...base, layout: "rail", showArchivedChats: true, waitingOn: true });
  assert.deepEqual(compact.state, { ...base, layout: "rail", projectCompact: true, chatCompact: true, waitingOn: true });
  assert.deepEqual(waiting.state, { ...base, waitingOn: true, waitingScope: "only" });
  assert.equal(sameSidebarViewState(standard.state, compact.state), false);
  assert.equal(sameSidebarViewState(standard.state, waiting.state), false);
});

test("patchOf: プロジェクト内の上にするときは並べ方をプロジェクト別に戻す（ほかの出し方はそのまま）", () => {
  assert.deepEqual(patchOf("waitingScope", "project"), { waitingScope: "project", waitingOrder: "project" });
  assert.deepEqual(patchOf("waitingScope", "only"), { waitingScope: "only" });
  assert.deepEqual(patchOf("chatCompact", true), { chatCompact: true });
});

test("describeSidebarView: 行ごとに選んだものの短い名前。要対応がオフなら出し方は書かない", () => {
  assert.equal(describeSidebarView(base), "プロジェクト: 縦並び・最近順・2 行 / チャット: グループ別・最近順・2 行 / 要対応: オフ");
  assert.equal(
    describeSidebarView({ ...base, showArchivedProjects: true, waitingOn: true, waitingScope: "project" }),
    "プロジェクト: 縦並び・最近順・2 行・アーカイブを表示 / チャット: グループ別・最近順・2 行 / 要対応: プロジェクト内・プロジェクト別",
  );
});
