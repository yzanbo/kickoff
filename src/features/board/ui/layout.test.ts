import assert from "node:assert/strict";
import { test } from "vitest";
import { applyView, boardLayout, columnsOn, DEFAULT_BOARD_VIEW, parseLayout, toggleColumns, type BoardLayoutState } from "./layout";

const project = (p: Partial<BoardLayoutState> = {}): BoardLayoutState => ({ ...DEFAULT_BOARD_VIEW.project, ...p });
const all = (p: Partial<BoardLayoutState> = {}): BoardLayoutState => ({ ...DEFAULT_BOARD_VIEW.all, ...p });

test("boardLayout: グループの列は、全プロジェクトのボードでは段がプロジェクトのときだけ、プロジェクトのボードではボードのときだけ", () => {
  assert.equal(boardLayout(all({ lanes: "project", columns: "groups" }), "all").byGroup, true);
  assert.equal(boardLayout(all({ lanes: "worktree", columns: "groups" }), "all").byGroup, false);
  assert.equal(boardLayout(all({ lanes: "none", columns: "groups" }), "all").byGroup, false);
  assert.equal(boardLayout(project({ view: "board", columns: "groups" }), "project").byGroup, true);
  assert.equal(boardLayout(project({ view: "list", columns: "groups" }), "project").byGroup, false);
  // 選べないときに覚えた「グループ」は状態の列で出す（状態で分ける）
  assert.deepEqual(boardLayout(project({ view: "list", columns: "groups" }), "project").bucketBy, "status");
});

test("boardLayout: プロジェクトのボードでグループの列のときは、段の「グループ」を選べず分けない形で出す", () => {
  const layout = boardLayout(project({ columns: "groups", lanes: "group" }), "project");
  assert.equal(layout.laneSplit, false);
  assert.equal(layout.laneValue, "none");
  assert.deepEqual(layout.laneChoices, ["worktree"]);
  assert.deepEqual(layout.bucketBy, []);
  const state = boardLayout(project({ columns: "state", lanes: "group" }), "project");
  assert.equal(state.groupLanes, true);
  assert.deepEqual(state.laneChoices, ["group", "worktree"]);
  assert.deepEqual(state.bucketBy, ["group", "status"]);
});

test("boardLayout: まとめ方と、チャットのないまとまりを出すか", () => {
  assert.deepEqual(boardLayout(all({ lanes: "project", columns: "groupsState" }), "all").bucketBy, "project");
  assert.equal(boardLayout(all({ lanes: "project", columns: "groupsState" }), "all").byState, true);
  assert.deepEqual(boardLayout(project({ columns: "none", lanes: "worktree" }), "project").bucketBy, ["worktree"]);
  assert.deepEqual(boardLayout(project({ columns: "none" }), "project").bucketBy, []);
  assert.deepEqual(boardLayout(project({ columns: "state" }), "project").bucketBy, "status");
  const keep = boardLayout(project({ columns: "state" }), "project").keepEmpty;
  assert.ok(typeof keep === "function" && keep({ kind: "status" } as never) && !keep({ kind: "group" } as never));
  assert.equal(boardLayout(all({ columns: "groups" }), "all").keepEmpty, true);
  // 選べない段の分け方を覚えていたら、そのボードの初めの段
  assert.equal(boardLayout(all({ lanes: "group", columns: "state" }), "all").lanes, "project");
  assert.equal(boardLayout(all({ view: "feed" }), "all").feed, true);
  assert.equal(boardLayout(project({ view: "feed" }), "project").feed, false);
});

test("toggleColumns: 「グループ」「状態」のオン・オフを 4 つの値に読み替える（出さない「グループ」は状態をオンにした形）", () => {
  assert.equal(toggleColumns("state", true, "groups"), "groupsState");
  assert.equal(toggleColumns("none", true, "groups"), "groups");
  assert.equal(toggleColumns("groupsState", true, "groups"), "state");
  assert.equal(toggleColumns("groups", true, "groups"), "none");
  assert.equal(toggleColumns("groups", true, "state"), "groupsState");
  assert.equal(toggleColumns("groupsState", true, "state"), "groups");
  assert.equal(toggleColumns("state", true, "state"), "none");
  assert.equal(toggleColumns("groups", false, "state"), "none");
  assert.deepEqual(columnsOn("groups", false), { groups: false, state: true });
});

test("applyView: 選べない段は段だけそのまま・表示項目のないビューは表示項目をそのまま・プロジェクトのボードにフィードは当てない", () => {
  const current = project({ lanes: "worktree", cardHidden: ["model"] });
  const next = applyView(current, { view: "list", lanes: "project", columns: "state", sort: current.sort, archive: "all" }, "project");
  assert.deepEqual(next, { ...current, view: "list", columns: "state", archive: "all" });
  assert.equal(applyView(current, { ...current, view: "feed" }, "project").view, "board");
  assert.equal(applyView(all(), { ...all(), view: "feed" }, "all").view, "feed");
});

test("parseLayout: 読めなければそのボードの初めの見え方（初めからあるビューの先頭）。表示項目がなければ初めの値", () => {
  assert.deepEqual(parseLayout(null, "all"), DEFAULT_BOARD_VIEW.all);
  assert.deepEqual(parseLayout({ view: "grid" }, "project"), DEFAULT_BOARD_VIEW.project);
  const { cardHidden: _, ...noFields } = project({ view: "list" });
  assert.deepEqual(parseLayout(noFields, "project"), project({ view: "list" }));
});
