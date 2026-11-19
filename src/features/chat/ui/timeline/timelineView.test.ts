import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { createTimelineViews, openAll, setOpen } from "./timelineView";

/** テストごとに店を作り、終わったら捨てる（モジュールの店はほかのテストのファイルに残るので使わない） */
function makeViews(limit = 50) {
  const views = createTimelineViews(limit);
  onTestFinished(() => views.clear());
  return views;
}

test("setOpen: 開閉を変えたら新しい Set、変えないときは同じ Set のまま", () => {
  const view = makeViews().view(1);
  const first = view.open.get();
  setOpen(view, "tg:10", true);
  const opened = view.open.get();
  assert.notEqual(opened, first);
  assert.equal(opened.has("tg:10"), true);
  setOpen(view, "tg:10", true);
  assert.equal(view.open.get(), opened);
  setOpen(view, "tg:10", false);
  assert.notEqual(view.open.get(), opened);
  assert.equal(view.open.get().has("tg:10"), false);
});

test("openAll: まとめて開き、もう全部開いていれば同じ Set のまま", () => {
  const view = makeViews().view(1);
  openAll(view, ["sa:a", "sa:b"]);
  const opened = view.open.get();
  assert.deepEqual([...opened].sort(), ["sa:a", "sa:b"]);
  openAll(view, ["sa:b"]);
  assert.equal(view.open.get(), opened);
});

test("createTimelineViews: 同じチャットは同じ見え方、上限を超えたらいちばん長く使っていないチャットから捨てる", () => {
  const views = makeViews(50);
  const first = views.view(1);
  setOpen(first, "th:5", true);
  assert.equal(views.view(1), first);
  for (let id = 2; id <= 51; id++) views.view(id);
  // 51 件目で、いちばん長く使っていない 1 が捨てられ、作り直すと閉じている
  const again = views.view(1);
  assert.notEqual(again, first);
  assert.equal(again.open.get().has("th:5"), false);
});

test("createTimelineViews: 使ったチャットは新しい側へ動き、捨てられない", () => {
  const views = makeViews(2);
  const a = views.view(1);
  views.view(2);
  views.view(1);
  views.view(3);
  assert.equal(views.view(1), a);
});
