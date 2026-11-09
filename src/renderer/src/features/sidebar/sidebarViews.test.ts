import assert from "node:assert/strict";
import { test } from "node:test";
import { SIDEBAR_SAVED_VIEWS } from "@/lib/storageKeys";
import { activeSidebarView, newSidebarViewName, parseSidebarViews, parseSidebarViewState, sameSidebarViewState, type SidebarView, type SidebarViewState } from "./sidebarViews";

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
  waitingView: "inbox-project",
};
const view = (id: string, state: Partial<SidebarViewState> = {}): SidebarView => ({ id, name: `v${id}`, state: { ...base, ...state } });

test("parseSidebarViewState: 合う形だけ読み、知らない値・足りない項目があれば捨てる", () => {
  assert.deepEqual(parseSidebarViewState({ ...base, extra: 1 }), base);
  assert.equal(parseSidebarViewState({ ...base, layout: "grid" }), undefined);
  assert.equal(parseSidebarViewState({ ...base, chatCompact: "1" }), undefined);
  const { waitingView: _, ...missing } = base;
  assert.equal(parseSidebarViewState(missing), undefined);
  assert.equal(parseSidebarViewState(null), undefined);
});

test("sameSidebarViewState: 要対応がオフどうしなら、出し方 × 並べ方は比べない", () => {
  assert.equal(sameSidebarViewState(base, { ...base, waitingView: "list" }), true);
  assert.equal(sameSidebarViewState({ ...base, waitingOn: true }, { ...base, waitingOn: true, waitingView: "list" }), false);
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
  const views = parseSidebarViews(SIDEBAR_SAVED_VIEWS.initial);
  assert.deepEqual(views.map((v) => v.name), ["標準", "コンパクト", "要対応"]);
  const [standard, compact, waiting] = views;
  assert.deepEqual(standard.state, { ...base, layout: "rail", showArchivedChats: true, waitingOn: true });
  assert.deepEqual(compact.state, { ...base, layout: "rail", projectCompact: true, chatCompact: true, waitingOn: true });
  assert.deepEqual(waiting.state, { ...base, waitingOn: true, waitingView: "filter" });
  assert.equal(sameSidebarViewState(standard.state, compact.state), false);
  assert.equal(sameSidebarViewState(standard.state, waiting.state), false);
});
